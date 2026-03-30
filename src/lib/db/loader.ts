import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface LoadResult {
  columns: string[];
}

/**
 * Loads a single File into DuckDB as a table named "data".
 * Drops any previous "data" table first to prevent stale results.
 * Returns the list of column names for use by checks.
 */
export async function loadFile(
  file: File,
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
): Promise<LoadResult> {
  await conn.query("DROP TABLE IF EXISTS data");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "parquet") {
    const buffer = new Uint8Array(await file.arrayBuffer());
    await db.registerFileBuffer(file.name, buffer);
    await conn.query(
      `CREATE TABLE data AS SELECT * FROM read_parquet(${JSON.stringify(file.name)})`,
    );
  } else {
    throw new Error(
      `Unsupported file format: .${ext}. Only Parquet (.parquet) files are supported.`,
    );
  }

  const desc = await conn.query("DESCRIBE data");
  const columns = desc.toArray().map((r) => r.column_name as string);
  return { columns };
}
