import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface LoadResult {
  columns: string[];
}

async function describeColumns(conn: AsyncDuckDBConnection): Promise<string[]> {
  const desc = await conn.query("DESCRIBE data");
  return desc.toArray().map((r) => r.column_name as string);
}

// ── Parquet ──────────────────────────────────────────────────────────────────

export async function loadParquet(
  file: File,
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
): Promise<LoadResult> {
  await conn.query("DROP TABLE IF EXISTS data");
  const buffer = new Uint8Array(await file.arrayBuffer());
  await db.registerFileBuffer(file.name, buffer);
  await conn.query(
    `CREATE TABLE data AS SELECT * FROM read_parquet(${JSON.stringify(file.name)})`,
  );
  return { columns: await describeColumns(conn) };
}

// ── GeoJSON ──────────────────────────────────────────────────────────────────
// Extracts feature properties via read_json — faster than GDAL and does not
// require the spatial extension.

export async function loadGeoJSON(
  file: File,
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
): Promise<LoadResult> {
  await conn.query("DROP TABLE IF EXISTS data");
  const text = await file.text();
  const geojson = JSON.parse(text);
  const rawFeatures: unknown[] =
    geojson.type === "FeatureCollection"
      ? geojson.features
      : geojson.type === "Feature"
        ? [geojson]
        : [];
  const properties = rawFeatures.map(
    (f) => (f as { properties: Record<string, unknown> }).properties ?? {},
  );
  const propsName = file.name + "__props.json";
  await db.registerFileBuffer(
    propsName,
    new TextEncoder().encode(JSON.stringify(properties)),
  );
  await conn.query(
    `CREATE TABLE data AS SELECT * FROM read_json(${JSON.stringify(propsName)}, auto_detect=true)`,
  );
  return { columns: await describeColumns(conn) };
}

// ── Generic spatial (GDAL / ST_Read) ─────────────────────────────────────────
// Works for any format supported by DuckDB's spatial extension: GeoPackage,
// Shapefile, FlatGeobuf, KML, GML, GPX, SpatiaLite, etc.
// The file(s) must already be registered in DuckDB's virtual FS before calling.

export async function listSpatialLayers(
  filePath: string,
  conn: AsyncDuckDBConnection,
): Promise<string[]> {
  // layers is LIST<STRUCT(name VARCHAR, ...)> — extract .name only
  const result = await conn.query(
    `SELECT unnest(layers).name AS layer_name FROM ST_Read_Meta(${JSON.stringify(filePath)}) ORDER BY layer_name`,
  );
  return result.toArray().map((r) => r.layer_name as string);
}

export async function loadSpatialLayer(
  filePath: string,
  layerName: string,
  conn: AsyncDuckDBConnection,
): Promise<LoadResult> {
  await conn.query("DROP TABLE IF EXISTS data");
  await conn.query(
    `CREATE TABLE data AS SELECT * FROM ST_Read(${JSON.stringify(filePath)}, layer=${JSON.stringify(layerName)})`,
  );
  return { columns: await describeColumns(conn) };
}

// ── Map preview helpers ───────────────────────────────────────────────────────

export interface PreviewData {
  /** GeoJSON FeatureCollection blob. MapPreview creates/revokes its own URL each mount. */
  blob: Blob;
  /** [minLng, minLat, maxLng, maxLat] in WGS-84, or null if unavailable. */
  bounds: [number, number, number, number] | null;
}

/**
 * Extracts geometry from the current `data` table and returns a blob URL to a
 * GeoJSON FeatureCollection plus the layer's bounding box.
 *
 * The blob URL keeps geometry out of the main JS heap — pass it directly to
 * MapLibre as source data, then revoke it once the source is loaded.
 *
 * Returns null if the table has no GEOMETRY column or the spatial extension
 * is unavailable.
 */
export async function buildPreviewData(
  conn: AsyncDuckDBConnection,
): Promise<PreviewData | null> {
  try {
    // Find the first GEOMETRY column in the current data table.
    const desc = await conn.query("DESCRIBE data");
    const allCols = desc.toArray() as Array<{
      column_name: string;
      column_type: string;
    }>;
    const geomCol = allCols.find(
      (r) => r.column_type === "GEOMETRY",
    )?.column_name;
    if (!geomCol) return null;
    const quotedCol = JSON.stringify(geomCol); // becomes "colName" — valid SQL quoted identifier

    // Compute bounding box. COD-AB data is always WGS-84, so no transform needed.
    let bounds: [number, number, number, number] | null = null;
    try {
      const bboxResult = await conn.query(`
        SELECT
          MIN(ST_XMin(${quotedCol})) AS xmin,
          MIN(ST_YMin(${quotedCol})) AS ymin,
          MAX(ST_XMax(${quotedCol})) AS xmax,
          MAX(ST_YMax(${quotedCol})) AS ymax
        FROM data
        WHERE ${quotedCol} IS NOT NULL
      `);
      const row = bboxResult.toArray()[0];
      const { xmin, ymin, xmax, ymax } = row as Record<string, number>;
      if (
        isFinite(xmin) &&
        isFinite(ymin) &&
        isFinite(xmax) &&
        isFinite(ymax)
      ) {
        bounds = [xmin, ymin, xmax, ymax];
      }
    } catch {
      // bounds stays null
    }

    // Extract geometry as GeoJSON features. COD-AB data is always WGS-84 so no
    // transform needed. No limit — MapLibre handles large files in its worker;
    // the blob is freed once loaded.
    const rows = await conn.query(`
      SELECT TRY(ST_AsGeoJSON(${quotedCol})) AS g
      FROM data
      WHERE ${quotedCol} IS NOT NULL
    `);

    const parts: string[] = [];
    for (const row of rows.toArray()) {
      const g = (row as Record<string, unknown>).g;
      if (g != null)
        parts.push(`{"type":"Feature","geometry":${g},"properties":{}}`);
    }
    if (parts.length === 0) return null;

    const geojson = `{"type":"FeatureCollection","features":[${parts.join(",")}]}`;
    const blob = new Blob([geojson], { type: "application/json" });

    return { blob, bounds };
  } catch {
    return null;
  }
}

// ── Multi-file registration helpers ──────────────────────────────────────────
// These formats require multiple component files to be loaded into DuckDB's
// virtual FS before ST_Read can open them.

/** Registers all shapefile component files and returns the .shp file path. */
export async function registerShapefileFiles(
  files: File[],
  db: AsyncDuckDB,
): Promise<string> {
  const relPaths = files.map(
    (f) =>
      (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name,
  );
  const shpPath = relPaths.find((p) => p.toLowerCase().endsWith(".shp")) ?? "";
  await Promise.all(
    files.map(async (file, i) => {
      const buffer = new Uint8Array(await file.arrayBuffer());
      await db.registerFileBuffer(relPaths[i], buffer);
    }),
  );
  return shpPath;
}
