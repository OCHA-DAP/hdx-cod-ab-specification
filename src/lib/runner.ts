import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { checks } from "./checks/registry.ts";
import type { CheckResult } from "./checks/types.ts";
import {
  loadParquet,
  loadGeoJSON,
  listSpatialLayers,
  loadSpatialLayer,
  registerShapefileFiles,
} from "./db/loader.ts";

export interface FileResult {
  fileName: string;
  loadError: string | null;
  checks: Record<string, CheckResult>; // keyed by check.name
}

export interface DatasetResult {
  files: FileResult[];
}

async function runChecks(
  conn: AsyncDuckDBConnection,
  columns: string[],
): Promise<Record<string, CheckResult>> {
  const results: Record<string, CheckResult> = {};
  for (const check of checks) {
    results[check.name] = await check.run(conn, columns);
  }
  return results;
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
  const individualFiles: File[] = [];

  for (const file of files) {
    const relPath =
      (file as File & { webkitRelativePath: string }).webkitRelativePath || "";

    const fullPath = relPath || file.name;
    const dotIdx = fullPath.lastIndexOf(".");
    if (dotIdx !== -1) {
      const ext = fullPath.slice(dotIdx).toLowerCase();
      if (SHP_EXTS.has(ext)) {
        const stem = fullPath.slice(0, dotIdx).toLowerCase();
        if (!shpGroups.has(stem)) shpGroups.set(stem, []);
        shpGroups.get(stem)!.push(file);
        continue;
      }
    }

    individualFiles.push(file);
  }

  // Drop shapefile groups that have no .shp file; treat their files as individuals
  for (const [stem, groupFiles] of shpGroups) {
    const hasShp = groupFiles.some((f) => {
      const p =
        (f as File & { webkitRelativePath: string }).webkitRelativePath ||
        f.name;
      return p.toLowerCase().endsWith(".shp");
    });
    if (!hasShp) {
      individualFiles.push(...groupFiles);
      shpGroups.delete(stem);
    }
  }

  return { shpGroups, individualFiles };
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
  // Parquet and GeoJSON are loaded natively; everything else goes through
  // ST_Read so any GDAL-supported format works automatically.

  for (const file of individualFiles) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "parquet") {
      const fileResult: FileResult = {
        fileName: file.name,
        loadError: null,
        checks: {},
      };
      try {
        const { columns } = await loadParquet(file, db, conn);
        fileResult.checks = await runChecks(conn, columns);
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
      };
      try {
        const { columns } = await loadGeoJSON(file, db, conn);
        fileResult.checks = await runChecks(conn, columns);
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

    let layers: string[];
    try {
      layers = await listSpatialLayers(file.name, conn);
    } catch (e) {
      results.push({
        fileName: file.name,
        loadError: e instanceof Error ? e.message : String(e),
        checks: {},
      });
      continue;
    }

    if (layers.length === 0) {
      results.push({
        fileName: file.name,
        loadError: `No layers found — format may not be supported in this browser.`,
        checks: {},
      });
      continue;
    }

    for (const layerName of layers) {
      const fileResult: FileResult = {
        fileName: `${file.name}::${layerName}`,
        loadError: null,
        checks: {},
      };
      try {
        const { columns } = await loadSpatialLayer(file.name, layerName, conn);
        fileResult.checks = await runChecks(conn, columns);
      } catch (e) {
        fileResult.loadError =
          "[load] " + (e instanceof Error ? e.message : String(e));
      }
      results.push(fileResult);
    }
  }

  // ── Shapefiles ────────────────────────────────────────────────────────────

  for (const [, shpFiles] of shpGroups) {
    let shpPath: string;
    let layers: string[];
    try {
      shpPath = await registerShapefileFiles(shpFiles, db);
      layers = await listSpatialLayers(shpPath, conn);
    } catch (e) {
      const name =
        shpFiles.find((f) => f.name.toLowerCase().endsWith(".shp"))?.name ??
        "shapefile";
      results.push({
        fileName: name,
        loadError: e instanceof Error ? e.message : String(e),
        checks: {},
      });
      continue;
    }

    for (const layerName of layers) {
      const fileResult: FileResult = {
        fileName: `${shpPath}::${layerName}`,
        loadError: null,
        checks: {},
      };
      try {
        const { columns } = await loadSpatialLayer(shpPath, layerName, conn);
        fileResult.checks = await runChecks(conn, columns);
      } catch (e) {
        fileResult.loadError =
          "[load] " + (e instanceof Error ? e.message : String(e));
      }
      results.push(fileResult);
    }
  }

  return { files: results };
}
