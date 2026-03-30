import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface CheckResult {
  passed: boolean;
  violations: string[]; // MUST violations — cause passed=false
  warnings: string[]; // SHOULD violations — don't cause failure
  info: string[]; // informational notes and known deviations
}

export interface Check {
  name: string; // machine name, e.g. "check_versions"
  label: string; // human-readable label, e.g. "Version"
  specSection: string; // spec reference, e.g. "Versions"
  appliesTo: ("all" | "admin" | "lines" | "points")[];
  run: (conn: AsyncDuckDBConnection, columns: string[]) => Promise<CheckResult>;
}
