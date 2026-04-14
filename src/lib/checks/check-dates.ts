import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { queryColumnStats } from "./helpers.ts";
import type { Check, CheckResult } from "./types.ts";

async function run(conn: AsyncDuckDBConnection, columns: string[]): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const hasValidOn = columns.includes("valid_on");
  const hasValidTo = columns.includes("valid_to");

  if (!hasValidOn) {
    violations.push(
      "`valid_on` column is absent. A `valid_on` date column MUST be present in all datasets.",
    );
  }
  if (!hasValidTo) {
    violations.push(
      "`valid_to` column is absent. A `valid_to` date column MUST be present in all datasets.",
    );
  }
  if (!hasValidOn || !hasValidTo) {
    return { passed: false, violations, warnings, info };
  }

  // Check valid_on
  const validOn = await queryColumnStats(conn, "valid_on");

  if (validOn.nullCount > 0) {
    violations.push("`valid_on` contains null values. `valid_on` MUST be non-null for all rows.");
  }
  if (validOn.distinctCount > 1) {
    const listed = validOn.distinctValues.map((v) => `"${v}"`).join(", ");
    violations.push(
      `\`valid_on\` has multiple distinct values: [${listed}]. ` +
        "All rows in a layer MUST share the same `valid_on` date.",
    );
  }

  // Check valid_to
  const validTo = await queryColumnStats(conn, "valid_to");

  if (validTo.distinctCount > 1) {
    const listed = validTo.distinctValues.map((v) => `"${v}"`).join(", ");
    violations.push(
      `\`valid_to\` has multiple distinct values: [${listed}]. ` +
        "All rows in a layer MUST share the same `valid_to` date.",
    );
  }
  if (validTo.nullCount === 0 && validTo.distinctCount >= 1) {
    // valid_to is non-null for every row → this is a retired (superseded) dataset
    info.push(
      `\`valid_to\` is set to "${validTo.distinctValues[0]}" for all rows — ` +
        "this dataset is marked as a retired (superseded) version.",
    );
  }

  return { passed: violations.length === 0, violations, warnings, info };
}

export const checkDates: Check = {
  name: "check_dates",
  label: "Dates",
  specSection: "Date Columns",
  appliesTo: ["all"],
  run,
};
