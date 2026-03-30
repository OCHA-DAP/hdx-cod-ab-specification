import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { checks } from "./checks/registry.ts";
import type { CheckResult } from "./checks/types.ts";
import { loadFile } from "./db/loader.ts";

export interface FileResult {
  fileName: string;
  loadError: string | null;
  checks: Record<string, CheckResult>; // keyed by check.name
}

export interface DatasetResult {
  files: FileResult[];
}

/**
 * Runs all registered checks against each file sequentially.
 * Files are processed one at a time because they share a single DuckDB connection.
 */
export async function runValidation(
  files: File[],
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
): Promise<DatasetResult> {
  const results: FileResult[] = [];

  for (const file of files) {
    const fileResult: FileResult = {
      fileName: file.name,
      loadError: null,
      checks: {},
    };

    try {
      const { columns } = await loadFile(file, db, conn);
      for (const check of checks) {
        fileResult.checks[check.name] = await check.run(conn, columns);
      }
    } catch (e) {
      fileResult.loadError = e instanceof Error ? e.message : String(e);
    }

    results.push(fileResult);
  }

  return { files: results };
}
