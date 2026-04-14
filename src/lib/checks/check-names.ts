import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { getNameColumnGroups } from "./helpers.ts";
import type { Check, CheckResult } from "./types.ts";

// Matches any bad whitespace: leading/trailing space, consecutive spaces, or non-space whitespace.
const BAD_WS_RE = String.raw`^\s|\s$|  |[\t\n\r\f\v]`;
// Standalone acronym: 2–5 uppercase letters only (e.g. "DRC", "USA"). Exempt from ALL-CAPS check.
const ACRONYM_RE = String.raw`^[A-Z]{2,5}$`;
// Must contain at least one Unicode letter.
const HAS_ALPHA_RE = String.raw`.*\p{L}.*`;

async function run(conn: AsyncDuckDBConnection, columns: string[]): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // ── Detect admin levels ───────────────────────────────────────────────────
  const groups = getNameColumnGroups(columns);

  if (groups.length === 0) {
    info.push("No `adm{L}_name` columns found — name checks skipped.");
    return { passed: true, violations, warnings, info };
  }

  // ── A. Column presence ────────────────────────────────────────────────────
  for (const g of groups) {
    if (!columns.includes(g.name)) {
      violations.push(
        `\`${g.name}\` column is absent. ` +
          `\`adm{L}_name\` MUST be present for every admin level in the dataset.`,
      );
    }
    for (const alt of [g.name1, g.name2, g.name3]) {
      if (!columns.includes(alt)) {
        violations.push(
          `\`${alt}\` column is absent. ` +
            `Alternate name columns MUST be present (values may be null).`,
        );
      }
    }
  }

  // ── B. Primary name: null/empty + max length ──────────────────────────────
  for (const g of groups) {
    if (!columns.includes(g.name)) continue;

    const result = await conn.query(
      `
SELECT
  COUNT(*) FILTER (WHERE "${g.name}" IS NULL OR TRIM("${g.name}"::VARCHAR) = '') AS null_or_empty,
  COUNT(*) FILTER (WHERE length("${g.name}"::VARCHAR) > 100)                     AS too_long
FROM data
    `.trim(),
    );
    const row = result.toArray()[0] as Record<string, unknown>;

    const nullOrEmpty = Number(row.null_or_empty);
    const tooLong = Number(row.too_long);

    if (nullOrEmpty > 0) {
      violations.push(
        `\`${g.name}\` has ${nullOrEmpty} null or empty value(s). ` +
          `\`${g.name}\` MUST be non-null and non-empty for every row.`,
      );
    }
    if (tooLong > 0) {
      violations.push(`\`${g.name}\` has ${tooLong} value(s) exceeding 100 characters.`);
    }
  }

  // Max length for alternate name columns (non-null values only).
  for (const g of groups) {
    for (const col of [g.name1, g.name2, g.name3]) {
      if (!columns.includes(col)) continue;

      const result = await conn.query(
        `
SELECT COUNT(*) FILTER (WHERE "${col}" IS NOT NULL AND length("${col}"::VARCHAR) > 100) AS too_long
FROM data
      `.trim(),
      );
      const tooLong = Number((result.toArray()[0] as Record<string, unknown>).too_long);
      if (tooLong > 0) {
        violations.push(`\`${col}\` has ${tooLong} value(s) exceeding 100 characters.`);
      }
    }
  }

  // ── C. Value quality: whitespace, casing, alphabetic ─────────────────────
  // Run once per existing name column. NULL / empty rows are excluded from all quality checks.
  for (const g of groups) {
    for (const col of [g.name, g.name1, g.name2, g.name3]) {
      if (!columns.includes(col)) continue;

      const stmt = await conn.prepare(
        `
SELECT
  COUNT(*) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND regexp_full_match("${col}"::VARCHAR, $1)
  ) AS bad_ws_count,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND regexp_full_match("${col}"::VARCHAR, $1)
  )[1:5] AS bad_ws_sample,

  COUNT(*) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND upper("${col}"::VARCHAR) = "${col}"::VARCHAR
      AND lower("${col}"::VARCHAR) != "${col}"::VARCHAR
      AND NOT regexp_full_match("${col}"::VARCHAR, $2)
  ) AS all_caps_count,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND upper("${col}"::VARCHAR) = "${col}"::VARCHAR
      AND lower("${col}"::VARCHAR) != "${col}"::VARCHAR
      AND NOT regexp_full_match("${col}"::VARCHAR, $2)
  )[1:5] AS all_caps_sample,

  COUNT(*) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND lower("${col}"::VARCHAR) = "${col}"::VARCHAR
      AND upper("${col}"::VARCHAR) != "${col}"::VARCHAR
  ) AS all_lower_count,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND lower("${col}"::VARCHAR) = "${col}"::VARCHAR
      AND upper("${col}"::VARCHAR) != "${col}"::VARCHAR
  )[1:5] AS all_lower_sample,

  COUNT(*) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND NOT regexp_full_match("${col}"::VARCHAR, $3)
  ) AS no_alpha_count,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1) FILTER (
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND NOT regexp_full_match("${col}"::VARCHAR, $3)
  )[1:5] AS no_alpha_sample
FROM data
      `.trim(),
      );

      const result = await stmt.query(BAD_WS_RE, ACRONYM_RE, HAS_ALPHA_RE);
      await stmt.close();
      const row = result.toArray()[0] as Record<string, unknown>;

      const badWsCount = Number(row.bad_ws_count);
      const allCapsCount = Number(row.all_caps_count);
      const allLowerCount = Number(row.all_lower_count);
      const noAlphaCount = Number(row.no_alpha_count);

      const badWsSample = Array.from((row.bad_ws_sample as Iterable<unknown>) ?? []).map(String);
      const allCapsSample = Array.from((row.all_caps_sample as Iterable<unknown>) ?? []).map(
        String,
      );
      const allLowerSample = Array.from((row.all_lower_sample as Iterable<unknown>) ?? []).map(
        String,
      );
      const noAlphaSample = Array.from((row.no_alpha_sample as Iterable<unknown>) ?? []).map(
        String,
      );

      if (badWsCount > 0) {
        const sample = badWsSample.map((v) => `"${v}"`).join(", ");
        violations.push(
          `\`${col}\` has ${badWsCount} value(s) with extraneous whitespace ` +
            `(leading/trailing space, consecutive spaces, or tab/newline). ` +
            `Examples: ${sample}.`,
        );
      }
      if (allCapsCount > 0) {
        const sample = allCapsSample.map((v) => `"${v}"`).join(", ");
        violations.push(
          `\`${col}\` has ${allCapsCount} ALL CAPS value(s). ` +
            `Names MUST NOT be fully uppercased. Examples: ${sample}.`,
        );
      }
      if (allLowerCount > 0) {
        const sample = allLowerSample.map((v) => `"${v}"`).join(", ");
        violations.push(
          `\`${col}\` has ${allLowerCount} all-lowercase value(s). ` +
            `Names MUST NOT be fully lowercased. Examples: ${sample}.`,
        );
      }
      if (noAlphaCount > 0) {
        const sample = noAlphaSample.map((v) => `"${v}"`).join(", ");
        violations.push(
          `\`${col}\` has ${noAlphaCount} value(s) containing no alphabetic characters. ` +
            `Every name MUST contain at least one letter. Examples: ${sample}.`,
        );
      }
    }
  }

  // ── D. Name uniqueness and consistency ───────────────────────────────────
  // For each level L ≥ 1:
  //   Uniqueness:   no two sibling units (same parent pcode, different own pcode)
  //                 may share the same name.
  //   Consistency:  all rows for the same own pcode must carry the same name.
  // Units are identified by adm{L}_pcode; rows are deduplicated before counting
  // so that a unit spanning many rows (e.g. adm1 rows in an adm2 file) is not
  // double-counted.
  for (const g of groups) {
    if (g.level === 0) continue;

    const parentPcode = `adm${g.level - 1}_pcode`;
    const ownPcode = `adm${g.level}_pcode`;

    if (!columns.includes(parentPcode) || !columns.includes(ownPcode)) {
      const missing = !columns.includes(parentPcode) ? parentPcode : ownPcode;
      info.push(
        `Name uniqueness/consistency check for \`adm${g.level}_name*\` skipped: ` +
          `\`${missing}\` not found.`,
      );
      continue;
    }

    for (const col of [g.name, g.name1, g.name2, g.name3]) {
      if (!columns.includes(col)) continue;

      // Uniqueness: same name used by different sibling units (different own pcodes).
      // Deduplicate by (parent, own, name) first so ancestor-level columns — which
      // repeat across child rows — are not incorrectly counted as duplicates.
      const uniqResult = await conn.query(
        `
WITH dupes AS (
  SELECT parent, nm, list(own ORDER BY own) AS owns
  FROM (
    SELECT DISTINCT
      "${parentPcode}"::VARCHAR AS parent,
      "${ownPcode}"::VARCHAR    AS own,
      TRIM("${col}"::VARCHAR)   AS nm
    FROM data
    WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
      AND "${parentPcode}" IS NOT NULL AND "${ownPcode}" IS NOT NULL
  )
  GROUP BY parent, nm
  HAVING COUNT(DISTINCT own) > 1
)
SELECT
  COUNT(*)                                              AS dupe_groups,
  list({'name': nm, 'pcodes': owns} ORDER BY nm)[1:5]  AS dupe_sample
FROM dupes
        `.trim(),
      );
      const uniqRow = uniqResult.toArray()[0] as Record<string, unknown>;
      const dupeGroups = Number(uniqRow.dupe_groups);
      if (dupeGroups > 0) {
        const rawSample = Array.from((uniqRow.dupe_sample as Iterable<unknown>) ?? []);
        const sample = rawSample
          .map((entry) => {
            const e = entry as Record<string, unknown>;
            const nm = String(e.name);
            const pcodes = Array.from((e.pcodes as Iterable<unknown>) ?? [])
              .map(String)
              .join(", ");
            return `"${nm}" (${pcodes})`;
          })
          .join(", ");
        violations.push(
          `\`${col}\`: ${dupeGroups} name(s) are shared by more than one sibling within the ` +
            `same \`${parentPcode}\`. Each name MUST identify exactly one unit within its parent. ` +
            `Examples: ${sample}.`,
        );
      }

      // Consistency: same own pcode appearing with different names (typos, variants).
      const conResult = await conn.query(
        `
SELECT
  COUNT(*)                                           AS inconsistent_count,
  list(DISTINCT own ORDER BY own)[1:5]               AS inconsistent_sample
FROM (
  SELECT "${ownPcode}"::VARCHAR AS own
  FROM data
  WHERE "${col}" IS NOT NULL AND TRIM("${col}"::VARCHAR) != ''
    AND "${ownPcode}" IS NOT NULL
  GROUP BY "${ownPcode}"::VARCHAR
  HAVING COUNT(DISTINCT TRIM("${col}"::VARCHAR)) > 1
)
        `.trim(),
      );
      const conRow = conResult.toArray()[0] as Record<string, unknown>;
      const inconsistentCount = Number(conRow.inconsistent_count);
      if (inconsistentCount > 0) {
        const sample = Array.from((conRow.inconsistent_sample as Iterable<unknown>) ?? [])
          .map(String)
          .map((v) => `"${v}"`)
          .join(", ");
        violations.push(
          `\`${col}\`: ${inconsistentCount} \`${ownPcode}\` value(s) appear with more than one ` +
            `name. A unit MUST always appear with the same name on every row. ` +
            `Examples of inconsistent P-codes: ${sample}.`,
        );
      }
    }
  }

  info.push(
    "Not checked: title-case particle detection, consistent abbreviated/full forms, " +
      "consistent script and encoding (require language-specific rules or external data).",
  );

  return { passed: violations.length === 0, violations, warnings, info };
}

export const checkNames: Check = {
  name: "check_names",
  label: "Name Columns",
  specSection: "Names",
  appliesTo: ["admin"],
  run,
};
