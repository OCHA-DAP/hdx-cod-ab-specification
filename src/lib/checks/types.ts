import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface CheckResult {
  passed: boolean;
  violations: string[]; // MUST violations — cause passed=false
  warnings: string[]; // SHOULD violations — don't cause failure
  info: string[]; // informational notes and known deviations
  /** Optional GeoJSON FeatureCollection string for map overlay visualization. */
  overlayGeojson?: string;
}

export interface Check {
  name: string; // machine name, e.g. "check_versions"
  label: string; // human-readable label, e.g. "Version"
  specSection: string; // spec reference, e.g. "Versions"
  appliesTo: ("all" | "admin" | "lines" | "points")[];
  run: (conn: AsyncDuckDBConnection, columns: string[]) => Promise<CheckResult>;
}

/** Context for one layer passed to a HierarchyCheck. */
export interface LayerContext {
  tableName: string; // DuckDB table name, e.g. 'parent_layer' or 'child_layer'
  columns: string[];
  adminLevel: number;
  layerName: string; // original layer name, e.g. "ago_admbnda_adm1_ocha"
  filePath: string; // DuckDB-registered file path (used to reload into named table)
  fileName: string; // matches FileResult.fileName for result attachment
}

/**
 * A check that operates on a pair of adjacent admin layers (level N-1 and N).
 * The runner identifies pairs and calls run() once per adjacent pair found.
 * Results are attached to the child layer's FileResult.
 *
 * appliesToPair is a string union to allow future relationship types
 * (e.g. 'admin-lines') without changing the runner's dispatch logic.
 */
export interface HierarchyCheck {
  name: string;
  label: string;
  specSection: string;
  appliesToPair: "adjacent-admin";
  run: (
    conn: AsyncDuckDBConnection,
    parent: LayerContext,
    child: LayerContext,
  ) => Promise<CheckResult>;
}
