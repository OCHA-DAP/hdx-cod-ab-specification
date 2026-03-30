import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface LoadResult {
  columns: string[];
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
  const desc = await conn.query("DESCRIBE data");
  return { columns: desc.toArray().map((r) => r.column_name as string) };
}

// ── GeoJSON ──────────────────────────────────────────────────────────────────
// Extracts feature properties into DuckDB without needing the spatial extension.

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
  const desc = await conn.query("DESCRIBE data");
  return { columns: desc.toArray().map((r) => r.column_name as string) };
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
  const desc = await conn.query("DESCRIBE data");
  return { columns: desc.toArray().map((r) => r.column_name as string) };
}

// ── Multi-file registration helpers ──────────────────────────────────────────
// These formats require multiple component files to be loaded into DuckDB's
// virtual FS before ST_Read can open them.

/** Registers all shapefile component files and returns the .shp file path. */
export async function registerShapefileFiles(
  files: File[],
  db: AsyncDuckDB,
): Promise<string> {
  let shpPath = "";
  for (const file of files) {
    const relPath =
      (file as File & { webkitRelativePath: string }).webkitRelativePath ||
      file.name;
    if (!shpPath && relPath.toLowerCase().endsWith(".shp")) {
      shpPath = relPath;
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    await db.registerFileBuffer(relPath, buffer);
  }
  return shpPath;
}
