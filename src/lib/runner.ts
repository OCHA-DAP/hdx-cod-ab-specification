import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { checks } from "./checks/registry.ts";
import type { CheckResult } from "./checks/types.ts";
import type { PreviewData } from "./db/loader.ts";
import {
  buildPreviewData,
  listSpatialLayers,
  loadGeoJSON,
  loadParquet,
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

async function runChecksAndPreview(
  conn: AsyncDuckDBConnection,
  columns: string[],
): Promise<{
  checks: Record<string, CheckResult>;
  preview: PreviewData | null;
}> {
  const checkResults: Record<string, CheckResult> = {};
  for (const check of checks) {
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
      (file as File & { webkitRelativePath: string }).webkitRelativePath ||
      file.name;
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

async function processLayers(
  filePath: string,
  conn: AsyncDuckDBConnection,
): Promise<FileResult[]> {
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
      const outcome = await runChecksAndPreview(conn, columns);
      fileResult.checks = outcome.checks;
      fileResult.preview = outcome.preview;
    } catch (e) {
      fileResult.loadError =
        "[load] " + (e instanceof Error ? e.message : String(e));
    }
    results.push(fileResult);
  }
  return results;
}

/**
 * Runs all registered checks against each layer sequentially.
 * Supports every format readable by DuckDB's spatial extension (via ST_Read /
 * GDAL) in addition to Parquet and GeoJSON. Shapefiles are grouped before loading.
 */
export async function runValidation(
  files: File[],
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
): Promise<DatasetResult> {
  const results: FileResult[] = [];
  const { shpGroups, individualFiles } = groupFiles(files);

  // ── Individual files ──────────────────────────────────────────────────────
  // Parquet and GeoJSON are loaded natively for speed; everything else goes
  // through ST_Read so any GDAL-supported format works automatically.

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
        const outcome = await runChecksAndPreview(conn, columns);
        fileResult.checks = outcome.checks;
        fileResult.preview = outcome.preview;
      } catch (e) {
        fileResult.loadError = e instanceof Error ? e.message : String(e);
      }
      results.push(fileResult);
      continue;
    }

    if (ext === "geojson" || ext === "json") {
      const fileResult: FileResult = {
        fileName: file.name,
        loadError: null,
        checks: {},
        preview: null,
      };
      try {
        const { columns } = await loadGeoJSON(file, db, conn);
        const outcome = await runChecksAndPreview(conn, columns);
        fileResult.checks = outcome.checks;
        // loadGeoJSON strips geometry from the data table (properties only), so
        // buildPreviewData returns null. Use the original file directly instead —
        // GeoJSON is always WGS-84 so no transform is needed, and the File blob
        // is already in memory from the upload.
        fileResult.preview = { url: URL.createObjectURL(file), bounds: null };
      } catch (e) {
        fileResult.loadError = e instanceof Error ? e.message : String(e);
      }
      results.push(fileResult);
      continue;
    }

    // All other formats: register the file buffer and let ST_Read (GDAL) handle it.
    // Multi-layer files (e.g. GeoPackage) produce one FileResult per layer.
    const buffer = new Uint8Array(await file.arrayBuffer());
    await db.registerFileBuffer(file.name, buffer);
    results.push(...(await processLayers(file.name, conn)));
  }

  // ── Shapefiles ────────────────────────────────────────────────────────────

  for (const [, shpFiles] of shpGroups) {
    let shpPath: string;
    try {
      shpPath = await registerShapefileFiles(shpFiles, db);
    } catch (e) {
      const name =
        shpFiles.find((f) => f.name.toLowerCase().endsWith(".shp"))?.name ??
        "shapefile";
      results.push({
        fileName: name,
        loadError: e instanceof Error ? e.message : String(e),
        checks: {},
        preview: null,
      });
      continue;
    }
    results.push(...(await processLayers(shpPath, conn)));
  }

  return { files: results };
}
