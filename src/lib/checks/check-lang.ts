import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { getNameColumnGroups } from "./helpers.ts";
import type { Check, CheckResult } from "./types.ts";

// Basic BCP 47 primary language tag: 2–3 ASCII letters. The spec also constrains max length to 3.
const BCP47_RE = String.raw`^[a-zA-Z]{2,3}$`;

const ALT_LANG_COLS = ["lang1", "lang2", "lang3"] as const;

async function run(conn: AsyncDuckDBConnection, columns: string[]): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // ── A. Column presence ────────────────────────────────────────────────────
  for (const col of ["lang", "lang1", "lang2", "lang3"] as const) {
    if (!columns.includes(col)) {
      violations.push(
        col === "lang"
          ? "`lang` column is absent. `lang` MUST be present in all datasets."
          : `\`${col}\` column is absent. Language columns MUST be present (values may be null).`,
      );
    }
  }

  if (!columns.includes("lang")) {
    return { passed: false, violations, warnings, info };
  }

  // ── B. `lang`: non-null + constant + BCP 47 format ───────────────────────
  const stmt = await conn.prepare(
    `
SELECT
  COUNT(*) FILTER (WHERE "lang" IS NULL)                                      AS null_count,
  COUNT(DISTINCT "lang"::VARCHAR)                                              AS distinct_count,
  list(DISTINCT "lang"::VARCHAR ORDER BY 1)                                   AS distinct_values,
  COUNT(*) FILTER (
    WHERE "lang" IS NOT NULL
      AND NOT regexp_full_match("lang"::VARCHAR, $1)
  )                                                                            AS bad_format_count,
  list(DISTINCT "lang"::VARCHAR ORDER BY 1) FILTER (
    WHERE "lang" IS NOT NULL
      AND NOT regexp_full_match("lang"::VARCHAR, $1)
  )                                                                            AS bad_format_values
FROM data
  `.trim(),
  );
  const langResult = await stmt.query(BCP47_RE);
  await stmt.close();

  const langRow = langResult.toArray()[0] as Record<string, unknown>;
  const langNullCount = Number(langRow.null_count);
  const langDistinctCount = Number(langRow.distinct_count);
  const langDistinctValues = Array.from((langRow.distinct_values as Iterable<unknown>) ?? []).map(
    String,
  );
  const langBadFormatCount = Number(langRow.bad_format_count);
  const langBadFormatValues = Array.from(
    (langRow.bad_format_values as Iterable<unknown>) ?? [],
  ).map(String);

  if (langNullCount > 0) {
    violations.push(
      `\`lang\` has ${langNullCount} null value(s). \`lang\` MUST be non-null for every row.`,
    );
  }
  if (langDistinctCount > 1) {
    const listed = langDistinctValues.map((v) => `"${v}"`).join(", ");
    violations.push(
      `\`lang\` has multiple distinct values: [${listed}]. All rows MUST share the same \`lang\` value.`,
    );
  }
  for (const v of langBadFormatValues) {
    violations.push(
      `\`lang\` value "${v}" does not match BCP 47 format ` +
        '(2-3 letter language tag, e.g. "en", "fra").',
    );
  }
  if (langDistinctCount === 1 && langBadFormatCount === 0) {
    info.push(`Primary language (\`lang\`): "${langDistinctValues[0]}".`);
  }

  // ── C. `lang1`/`lang2`/`lang3`: constant + BCP 47 (non-null values only) ─
  for (const col of ALT_LANG_COLS) {
    if (!columns.includes(col)) continue;

    const altStmt = await conn.prepare(
      `
SELECT
  COUNT(DISTINCT "${col}"::VARCHAR) FILTER (WHERE "${col}" IS NOT NULL) AS distinct_non_null,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1) FILTER (
    WHERE "${col}" IS NOT NULL
  )                                                                      AS distinct_values,
  COUNT(*) FILTER (
    WHERE "${col}" IS NOT NULL
      AND NOT regexp_full_match("${col}"::VARCHAR, $1)
  )                                                                      AS bad_format_count,
  list(DISTINCT "${col}"::VARCHAR ORDER BY 1) FILTER (
    WHERE "${col}" IS NOT NULL
      AND NOT regexp_full_match("${col}"::VARCHAR, $1)
  )                                                                      AS bad_format_values
FROM data
    `.trim(),
    );
    const altResult = await altStmt.query(BCP47_RE);
    await altStmt.close();

    const altRow = altResult.toArray()[0] as Record<string, unknown>;
    const distinctNonNull = Number(altRow.distinct_non_null);
    const distinctValues = Array.from((altRow.distinct_values as Iterable<unknown>) ?? []).map(
      String,
    );
    const badFormatValues = Array.from((altRow.bad_format_values as Iterable<unknown>) ?? []).map(
      String,
    );

    if (distinctNonNull > 1) {
      const listed = distinctValues.map((v) => `"${v}"`).join(", ");
      violations.push(
        `\`${col}\` has multiple non-null distinct values: [${listed}]. ` +
          `All rows MUST share the same \`${col}\` value.`,
      );
    }
    for (const v of badFormatValues) {
      violations.push(
        `\`${col}\` value "${v}" does not match BCP 47 format ` +
          '(2–3 letter language tag, e.g. "en", "fra").',
      );
    }
    if (distinctNonNull === 1 && badFormatValues.length === 0) {
      const n = col.slice(-1); // '1', '2', or '3'
      info.push(`Alternate language ${n} (\`${col}\`): "${distinctValues[0]}".`);
    }
  }

  // ── D. Null consistency: if langN is null, all adm{L}_nameN must be null ──
  // Determine which alternate lang cols are entirely null (language absent).
  const presentAltLangs = ALT_LANG_COLS.filter((c) => columns.includes(c));

  if (presentAltLangs.length > 0) {
    const nullCheckResult = await conn.query(
      `
SELECT
  ${presentAltLangs.map((c) => `COUNT(*) FILTER (WHERE "${c}" IS NOT NULL) AS ${c}_present`).join(",\n  ")}
FROM data
    `.trim(),
    );
    const nullCheckRow = nullCheckResult.toArray()[0] as Record<string, unknown>;

    const nameGroups = getNameColumnGroups(columns);

    for (const langCol of presentAltLangs) {
      const isLangPresent = Number(nullCheckRow[`${langCol}_present`]) > 0;
      if (isLangPresent) continue;

      // langCol is entirely null — all corresponding adm{L}_nameN must also be null.
      const n = langCol.slice(-1); // '1', '2', or '3'
      for (const g of nameGroups) {
        const nameCol = g[`name${n}` as "name1" | "name2" | "name3"];
        if (!columns.includes(nameCol)) continue;

        const r = await conn.query(
          `
SELECT COUNT(*) FILTER (WHERE "${nameCol}" IS NOT NULL AND TRIM("${nameCol}"::VARCHAR) != '')
  AS non_null_count
FROM data
        `.trim(),
        );
        const nonNullCount = Number((r.toArray()[0] as Record<string, unknown>).non_null_count);
        if (nonNullCount > 0) {
          violations.push(
            `\`${langCol}\` is null but \`${nameCol}\` has ${nonNullCount} non-null value(s). ` +
              `When \`${langCol}\` is null, all \`adm{L}_name${n}\` columns MUST be null.`,
          );
        }
      }
    }
  }

  info.push(
    "Not checked: Admin 0 country name (UN M49) — requires an external lookup table. " +
      "`lang` romanization — only BCP 47 format is validated.",
  );

  return { passed: violations.length === 0, violations, warnings, info };
}

export const checkLang: Check = {
  name: "check_lang",
  label: "Language Columns",
  specSection: "Names",
  appliesTo: ["admin"],
  run,
};
