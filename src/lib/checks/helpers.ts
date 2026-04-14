import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

/**
 * Describes the four name columns for a single admin level.
 * The column name strings are always populated regardless of whether the column
 * is actually present in the dataset — callers should check against `columns`.
 */
export interface NameColumnGroup {
  level: number;
  name: string; // adm{L}_name
  name1: string; // adm{L}_name1
  name2: string; // adm{L}_name2
  name3: string; // adm{L}_name3
}

/**
 * Return a NameColumnGroup for every admin level that has at least one
 * adm{L}_name* column present in `columns`, sorted by level ascending.
 */
export function getNameColumnGroups(columns: string[]): NameColumnGroup[] {
  const levels = new Set<number>();
  for (const col of columns) {
    const m = col.match(/^adm(\d+)_name\d*$/);
    if (m) levels.add(Number(m[1]));
  }
  return Array.from(levels)
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      name: `adm${level}_name`,
      name1: `adm${level}_name1`,
      name2: `adm${level}_name2`,
      name3: `adm${level}_name3`,
    }));
}

/**
 * Return all adm{L}_pcode columns present in `columns`, sorted by level ascending.
 */
export function getPcodeColumns(columns: string[]): Array<{ level: number; col: string }> {
  return columns
    .map((col) => {
      const m = col.match(/^adm(\d+)_pcode$/);
      return m ? { level: Number(m[1]), col } : null;
    })
    .filter((x): x is { level: number; col: string } => x !== null)
    .sort((a, b) => a.level - b.level);
}

export interface ColumnStats {
  distinctCount: number;
  distinctValues: string[];
  nullCount: number;
  badFormat: string[]; // empty unless badFormatRegex was supplied
}

/**
 * Query basic statistics for a column in the `data` view.
 *
 * @param conn          - Active DuckDB connection
 * @param col           - Column name to analyse
 * @param badFormatRegex - Optional regex; rows that do NOT match are returned in `badFormat`
 */
export async function queryColumnStats(
  conn: AsyncDuckDBConnection,
  col: string,
  badFormatRegex?: string,
): Promise<ColumnStats> {
  const sql = badFormatRegex
    ? `
SELECT
    COUNT(DISTINCT "${col}")                                        AS distinct_count,
    list(DISTINCT "${col}"::VARCHAR ORDER BY 1)                     AS distinct_values,
    COUNT(*) FILTER (WHERE "${col}" IS NULL)                        AS null_count,
    list(DISTINCT "${col}"::VARCHAR)
        FILTER (WHERE "${col}" IS NOT NULL
                  AND NOT regexp_full_match("${col}"::VARCHAR, $1)) AS bad_format
FROM data
      `.trim()
    : `
SELECT
    COUNT(DISTINCT "${col}")                    AS distinct_count,
    list(DISTINCT "${col}"::VARCHAR ORDER BY 1) AS distinct_values,
    COUNT(*) FILTER (WHERE "${col}" IS NULL)    AS null_count
FROM data
      `.trim();

  let row: Record<string, unknown>;
  if (badFormatRegex) {
    const stmt = await conn.prepare(sql);
    const result = await stmt.query(badFormatRegex);
    await stmt.close();
    row = result.toArray()[0] as Record<string, unknown>;
  } else {
    const result = await conn.query(sql);
    row = result.toArray()[0] as Record<string, unknown>;
  }

  return {
    distinctCount: Number(row.distinct_count),
    // Arrow list columns may contain BigInt values — map to plain strings so
    // JSON.stringify on the resulting arrays is always safe.
    distinctValues: Array.from((row.distinct_values as Iterable<unknown>) ?? []).map(String),
    nullCount: Number(row.null_count),
    badFormat: Array.from((row.bad_format as Iterable<unknown>) ?? []).map(String),
  };
}
