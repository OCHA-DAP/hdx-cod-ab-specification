import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { Check, CheckResult } from "./types.ts";
import { getPcodeColumns } from "./helpers.ts";

// Valid pcode: 2–3 uppercase (or lowercase) letters followed by zero or more digits.
// adm0 codes have no digits; subnational codes have digits after the country prefix.
const PCODE_RE = String.raw`^[A-Za-z]{2,3}\d*$`;
// Subset: exactly 3-letter prefix (alpha-3 country code) — warn but don't fail
const ALPHA3_RE = String.raw`^[A-Za-z]{3}\d*$`;
// Common delimiter characters users may accidentally include
const DELIMITER_RE = String.raw`.*[.\-_/ ].*`;

// Numeric column type names that indicate a pcode was stored as a number (losing leading zeros)
const NUMERIC_TYPES = new Set([
  "INTEGER",
  "INT",
  "BIGINT",
  "HUGEINT",
  "SMALLINT",
  "TINYINT",
  "UBIGINT",
  "DOUBLE",
  "FLOAT",
  "REAL",
  "DECIMAL",
  "NUMERIC",
]);

async function run(conn: AsyncDuckDBConnection, columns: string[]): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const pcodeCols = getPcodeColumns(columns);

  if (pcodeCols.length === 0) {
    info.push("No `adm{L}_pcode` columns found — P-code format checks skipped.");
    return { passed: true, violations, warnings, info };
  }

  // Detect column types once via DESCRIBE to catch numeric storage
  const describeResult = await conn.query("DESCRIBE data");
  const colTypes = new Map<string, string>(
    describeResult.toArray().map((r) => {
      const row = r as Record<string, unknown>;
      return [String(row.column_name), String(row.column_type).toUpperCase()];
    }),
  );

  for (const { level, col } of pcodeCols) {
    // Check numeric storage type
    const colType = colTypes.get(col);
    if (colType && NUMERIC_TYPES.has(colType.replace(/\(.*\)/, "").trim())) {
      violations.push(
        `\`${col}\` is stored as ${colType} but P-codes MUST be stored as strings ` +
          "to preserve leading zeros.",
      );
      // Skip further checks — the values may be unreadable as strings
      continue;
    }

    const stmt = await conn.prepare(
      `
SELECT
  COUNT(*) FILTER (WHERE "${col}" IS NULL OR TRIM("${col}"::VARCHAR) = '')       AS null_or_empty_count,
  COUNT(*) FILTER (WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
    AND NOT regexp_full_match("${col}"::VARCHAR, $1))                             AS bad_format_count,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1)
    FILTER (WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND NOT regexp_full_match("${col}"::VARCHAR, $1))[1:5]                      AS bad_format_sample,
  COUNT(*) FILTER (WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
    AND regexp_full_match("${col}"::VARCHAR, $2))                                 AS alpha3_count,
  COUNT(*) FILTER (WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
    AND regexp_full_match("${col}"::VARCHAR, $3))                                 AS delimited_count,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1)
    FILTER (WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND regexp_full_match("${col}"::VARCHAR, $3))[1:5]                          AS delimited_sample,
  MAX(length("${col}"::VARCHAR))                                                  AS max_len
FROM data
    `.trim(),
    );

    const result = await stmt.query(PCODE_RE, ALPHA3_RE, DELIMITER_RE);
    await stmt.close();

    const row = result.toArray()[0] as Record<string, unknown>;
    const nullOrEmptyCount = Number(row.null_or_empty_count);
    const badFormatCount = Number(row.bad_format_count);
    const badFormatSample = Array.from((row.bad_format_sample as Iterable<unknown>) ?? []).map(
      String,
    );
    const alpha3Count = Number(row.alpha3_count);
    const delimitedCount = Number(row.delimited_count);
    const delimitedSample = Array.from((row.delimited_sample as Iterable<unknown>) ?? []).map(
      String,
    );
    const maxLen = Number(row.max_len ?? 0);

    if (nullOrEmptyCount > 0) {
      violations.push(
        `\`${col}\` has ${nullOrEmptyCount} null or empty value(s). ` +
          "P-codes MUST be present for every feature.",
      );
    }

    if (delimitedCount > 0) {
      const sample = delimitedSample.map((v) => `"${v}"`).join(", ");
      violations.push(
        `\`${col}\` has ${delimitedCount} value(s) containing delimiter characters (., -, _, /, space). ` +
          `P-codes MUST NOT contain delimiters. Examples: ${sample}.`,
      );
    }

    if (badFormatCount > 0) {
      const sample = badFormatSample.map((v) => `"${v}"`).join(", ");
      violations.push(
        `\`${col}\` has ${badFormatCount} value(s) not matching the required format ` +
          "(ISO alpha-2 or alpha-3 country code prefix followed by digits only). " +
          `Examples: ${sample}.`,
      );
    }

    if (maxLen > 20) {
      violations.push(
        `\`${col}\` has values exceeding 20 characters (longest: ${maxLen}). ` +
          "P-codes MUST be at most 20 characters.",
      );
    }

    // Warn about alpha-3 only when all non-null values use a 3-letter prefix
    // (i.e. no format violations from non-alpha-3 values)
    if (alpha3Count > 0 && badFormatCount === 0 && delimitedCount === 0) {
      warnings.push(
        `\`${col}\` appears to use an ISO alpha-3 country prefix (3 letters). ` +
          "P-codes SHOULD use the shorter alpha-2 prefix (2 letters) for compactness.",
      );
    }
  }

  return { passed: violations.length === 0, violations, warnings, info };
}

export const checkPcodeFormat: Check = {
  name: "check_pcode_format",
  label: "P-code Format",
  specSection: "Codes",
  appliesTo: ["admin"],
  run,
};
