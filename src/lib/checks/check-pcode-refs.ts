import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { Check, CheckResult } from "./types.ts";
import { getPcodeColumns } from "./helpers.ts";

async function run(conn: AsyncDuckDBConnection, columns: string[]): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const pcodeCols = getPcodeColumns(columns);

  if (pcodeCols.length === 0) {
    info.push("No `adm{L}_pcode` columns found — P-code reference checks skipped.");
    return { passed: true, violations, warnings, info };
  }

  // Uniqueness: applies only to the highest-level pcode (the "own" pcode of each feature).
  // Parent-level pcodes repeat intentionally for all features sharing the same parent.
  const ownLevel = pcodeCols[pcodeCols.length - 1];

  const dupeResult = await conn.query(
    `
SELECT
  COUNT(*)                                                        AS dupe_group_count,
  list("${ownLevel.col}"::VARCHAR ORDER BY 1)[1:5]               AS dupe_sample
FROM (
  SELECT "${ownLevel.col}"
  FROM data
  WHERE "${ownLevel.col}" IS NOT NULL
  GROUP BY "${ownLevel.col}"
  HAVING COUNT(*) > 1
)
  `.trim(),
  );

  const dupeRow = dupeResult.toArray()[0] as Record<string, unknown>;
  const dupeGroupCount = Number(dupeRow.dupe_group_count);
  const dupeSample = Array.from((dupeRow.dupe_sample as Iterable<unknown>) ?? []).map(String);

  if (dupeGroupCount > 0) {
    const sample = dupeSample.map((v) => `"${v}"`).join(", ");
    violations.push(
      `\`${ownLevel.col}\` has ${dupeGroupCount} duplicate value(s). ` +
        `P-codes MUST be unique within their administrative level. Examples: ${sample}.`,
    );
  }

  // Hierarchy: each adm{L}_pcode must start with the corresponding adm{L-1}_pcode.
  for (let i = 1; i < pcodeCols.length; i++) {
    const parent = pcodeCols[i - 1];
    const child = pcodeCols[i];

    const hierResult = await conn.query(
      `
SELECT
  COUNT(*)                                                           AS violation_count,
  list("${child.col}"::VARCHAR ORDER BY 1)[1:5]                     AS violation_sample
FROM data
WHERE "${child.col}" IS NOT NULL
  AND "${parent.col}" IS NOT NULL
  AND NOT starts_with("${child.col}"::VARCHAR, "${parent.col}"::VARCHAR)
    `.trim(),
    );

    const hierRow = hierResult.toArray()[0] as Record<string, unknown>;
    const violationCount = Number(hierRow.violation_count);
    const violationSample = Array.from((hierRow.violation_sample as Iterable<unknown>) ?? []).map(
      String,
    );

    if (violationCount > 0) {
      const sample = violationSample.map((v) => `"${v}"`).join(", ");
      violations.push(
        `${violationCount} feature(s) have \`${child.col}\` that does not start with ` +
          `the corresponding \`${parent.col}\`. ` +
          `P-codes MUST be hierarchically nested. Examples of failing codes: ${sample}.`,
      );
    }
  }

  return { passed: violations.length === 0, violations, warnings, info };
}

export const checkPcodeRefs: Check = {
  name: "check_pcode_refs",
  label: "P-code References",
  specSection: "Codes",
  appliesTo: ["admin"],
  run,
};
