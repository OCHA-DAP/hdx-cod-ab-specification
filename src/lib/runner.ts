import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { checks, hierarchyChecks } from "./checks/registry.ts";
import type { CheckResult, LayerContext } from "./checks/types.ts";
import type { PreviewData } from "./db/loader.ts";
import {
  buildPreviewData,
  loadLayerAsTable,
  loadParquet,
  listSpatialLayers,
  loadSpatialLayer,
  registerShapefileFiles,
} from "./db/loader.ts";

export interface FileResult {
  fileName: string;
  loadError: string | null;
  checks: Record<string, CheckResult>; // keyed by check.name
  /** Blob URL + bounds for the map preview. Null if no geometry column or spatial ext unavailable. */
  preview: PreviewData | null;
}

export interface DatasetResult {
  files: FileResult[];
}

// Infer the layer type from the layer name for appliesTo filtering.
function inferLayerType(layerName: string): "admin" | "lines" | "points" | null {
  if (/_adm(in)?\d/i.test(layerName)) return "admin";
  if (/_(adminlines?|lines?|lin)\b/i.test(layerName)) return "lines";
  if (/_(adminpoints?|points?|pts?)\b/i.test(layerName)) return "points";
  return null;
}

// Infer the numeric admin level from the layer name, e.g. "_adm1" → 1.
function inferAdminLevel(layerName: string): number | null {
  const m = layerName.match(/_adm(?:in)?(\d)/i);
  return m ? Number(m[1]) : null;
}

async function runChecksAndPreview(
  conn: AsyncDuckDBConnection,
  columns: string[],
  layerName: string,
): Promise<{
  checks: Record<string, CheckResult>;
  preview: PreviewData | null;
}> {
  const layerType = inferLayerType(layerName);
  const checkResults: Record<string, CheckResult> = {};
  for (const check of checks) {
    if (
      !check.appliesTo.includes("all") &&
      (layerType === null || !check.appliesTo.includes(layerType))
    ) {
      continue;
    }
    checkResults[check.name] = await check.run(conn, columns);
  }
  const preview = await buildPreviewData(conn);
  return { checks: checkResults, preview };
}

const SHP_EXTS = new Set([".shp", ".dbf", ".shx", ".prj", ".cpg"]);

/**
 * Groups files by format:
 * - Shapefile: files sharing the same stem and a shapefile extension; only
 *   groups that contain a .shp file are kept (orphaned sidecars become individuals)
 * - Individual: everything else
 */
function groupFiles(files: File[]): {
  shpGroups: Map<string, File[]>; // lowercased stem -> all component files
  individualFiles: File[];
} {
  const shpGroups = new Map<string, File[]>();
  const shpStems = new Set<string>(); // stems that have a .shp file
  const individualFiles: File[] = [];

  for (const file of files) {
    const fullPath =
      (file as File & { webkitRelativePath: string }).webkitRelativePath || file.name;
    const dotIdx = fullPath.lastIndexOf(".");
    if (dotIdx !== -1) {
      const ext = fullPath.slice(dotIdx).toLowerCase();
      if (SHP_EXTS.has(ext)) {
        const stem = fullPath.slice(0, dotIdx).toLowerCase();
        if (!shpGroups.has(stem)) shpGroups.set(stem, []);
        shpGroups.get(stem)!.push(file);
        if (ext === ".shp") shpStems.add(stem);
        continue;
      }
    }
    individualFiles.push(file);
  }

  // Drop shapefile groups that have no .shp file; treat their files as individuals
  for (const [stem, groupFiles] of shpGroups) {
    if (!shpStems.has(stem)) {
      individualFiles.push(...groupFiles);
      shpGroups.delete(stem);
    }
  }

  return { shpGroups, individualFiles };
}

async function processLayers(filePath: string, conn: AsyncDuckDBConnection): Promise<FileResult[]> {
  let layers: string[];
  try {
    layers = await listSpatialLayers(filePath, conn);
  } catch (e) {
    return [
      {
        fileName: filePath,
        loadError: e instanceof Error ? e.message : String(e),
        checks: {},
        preview: null,
      },
    ];
  }

  if (layers.length === 0) {
    return [
      {
        fileName: filePath,
        loadError: `No layers found — format may not be supported in this browser.`,
        checks: {},
        preview: null,
      },
    ];
  }

  const results: FileResult[] = [];
  for (const layerName of layers) {
    const fileResult: FileResult = {
      fileName: `${filePath}::${layerName}`,
      loadError: null,
      checks: {},
      preview: null,
    };
    try {
      const { columns } = await loadSpatialLayer(filePath, layerName, conn);
      const outcome = await runChecksAndPreview(conn, columns, layerName);
      fileResult.checks = outcome.checks;
      fileResult.preview = outcome.preview;
    } catch (e) {
      fileResult.loadError = "[load] " + (e instanceof Error ? e.message : String(e));
    }
    results.push(fileResult);
  }
  return results;
}

/**
 * Runs all registered checks against each layer sequentially.
 * All formats are loaded via ST_Read (GDAL). Shapefiles are grouped before loading.
 * After per-layer checks, runs hierarchy checks against adjacent admin level pairs.
 */
export async function runValidation(
  files: File[],
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
): Promise<DatasetResult> {
  const results: FileResult[] = [];
  // Map from admin level → LayerContext, populated as admin layers are processed.
  // First-found wins when multiple layers share the same level.
  const adminLayers = new Map<number, LayerContext>();

  // Attempt to register a successfully loaded FileResult as an admin layer.
  // filePath and layerName are parsed from fileResult.fileName:
  //   multi-layer format  → "<filePath>::<layerName>"
  //   single-layer format → "<filePath>" (layerName derived from stem)
  function trackAdminLayer(fileResult: FileResult) {
    if (fileResult.loadError) return;
    const sep = fileResult.fileName.indexOf("::");
    const filePath = sep === -1 ? fileResult.fileName : fileResult.fileName.slice(0, sep);
    const layerName =
      sep === -1 ? fileResult.fileName.replace(/\.[^.]+$/, "") : fileResult.fileName.slice(sep + 2);
    const level = inferAdminLevel(layerName);
    if (level === null || adminLayers.has(level)) return;
    adminLayers.set(level, {
      tableName: "", // set during the hierarchy phase
      columns: [], // set during the hierarchy phase via loadLayerAsTable
      adminLevel: level,
      layerName,
      filePath,
      fileName: fileResult.fileName,
    });
  }

  const { shpGroups, individualFiles } = groupFiles(files);

  // ── Individual files ──────────────────────────────────────────────────────
  // Parquet and GeoJSON are loaded natively; everything else goes through
  // ST_Read so any GDAL-supported format works automatically.

  for (const file of individualFiles) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "parquet") {
      const fileResult: FileResult = {
        fileName: file.name,
        loadError: null,
        checks: {},
        preview: null,
      };
      try {
        const { columns } = await loadParquet(file, db, conn);
        const outcome = await runChecksAndPreview(conn, columns, file.name.replace(/\.[^.]+$/, ""));
        fileResult.checks = outcome.checks;
        fileResult.preview = outcome.preview;
      } catch (e) {
        fileResult.loadError = e instanceof Error ? e.message : String(e);
      }
      results.push(fileResult);
      trackAdminLayer(fileResult);
      continue;
    }

    // All other formats (GeoJSON, GeoPackage, FlatGeobuf, KML, …): register the
    // file buffer and let ST_Read (GDAL) handle it.
    // Multi-layer files (e.g. GeoPackage) produce one FileResult per layer.
    const buffer = new Uint8Array(await file.arrayBuffer());
    await db.registerFileBuffer(file.name, buffer);
    const layerResults = await processLayers(file.name, conn);
    results.push(...layerResults);
    for (const fr of layerResults) trackAdminLayer(fr);
  }

  // ── Shapefiles ────────────────────────────────────────────────────────────

  for (const [, shpFiles] of shpGroups) {
    let shpPath: string;
    try {
      shpPath = await registerShapefileFiles(shpFiles, db);
    } catch (e) {
      const name = shpFiles.find((f) => f.name.toLowerCase().endsWith(".shp"))?.name ?? "shapefile";
      results.push({
        fileName: name,
        loadError: e instanceof Error ? e.message : String(e),
        checks: {},
        preview: null,
      });
      continue;
    }
    const layerResults = await processLayers(shpPath, conn);
    results.push(...layerResults);
    for (const fr of layerResults) trackAdminLayer(fr);
  }

  // ── Hierarchy checks ──────────────────────────────────────────────────────
  // For each pair of consecutive admin levels (N, N+1), load both into named
  // DuckDB tables and run all registered hierarchy checks.
  // Results are attached to the child layer's FileResult.

  const sortedLevels = [...adminLayers.keys()].sort((a, b) => a - b);
  for (let i = 0; i < sortedLevels.length - 1; i++) {
    const pLevel = sortedLevels[i];
    const cLevel = sortedLevels[i + 1];
    if (cLevel !== pLevel + 1) continue; // skip non-consecutive levels

    const parentInfo = adminLayers.get(pLevel)!;
    const childInfo = adminLayers.get(cLevel)!;

    // Load both layers into named tables; collect columns for LayerContext.
    const parentColumns = await loadLayerAsTable(
      parentInfo.filePath,
      parentInfo.layerName,
      "parent_layer",
      conn,
    );
    const childColumns = await loadLayerAsTable(
      childInfo.filePath,
      childInfo.layerName,
      "child_layer",
      conn,
    );

    const parentCtx: LayerContext = {
      ...parentInfo,
      tableName: "parent_layer",
      columns: parentColumns,
    };
    const childCtx: LayerContext = {
      ...childInfo,
      tableName: "child_layer",
      columns: childColumns,
    };

    const childFileResult = results.find((r) => r.fileName === childCtx.fileName);

    for (const check of hierarchyChecks) {
      if (check.appliesToPair === "adjacent-admin") {
        const checkResult = await check.run(conn, parentCtx, childCtx);
        if (childFileResult) childFileResult.checks[check.name] = checkResult;
      }
    }

    await conn.query("DROP TABLE IF EXISTS parent_layer");
    await conn.query("DROP TABLE IF EXISTS child_layer");
  }

  return { files: results };
}
