import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { Check, CheckResult } from "./types.ts";

export async function findGeomColumn(conn: AsyncDuckDBConnection): Promise<string | null> {
  const desc = await conn.query("DESCRIBE data");
  const cols = desc.toArray() as Array<{
    column_name: string;
    column_type: string;
  }>;
  return cols.find((r) => r.column_type === "GEOMETRY")?.column_name ?? null;
}

async function run(conn: AsyncDuckDBConnection, _columns: string[]): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const geomCol = await findGeomColumn(conn);
  if (!geomCol) {
    info.push("No GEOMETRY column found — geometry checks skipped.");
    return { passed: true, violations, warnings, info };
  }

  // JSON.stringify produces a double-quoted SQL identifier, e.g. "geom"
  const q = JSON.stringify(geomCol);

  // ── 1. Null / empty geometries ────────────────────────────────────────────
  const nullResult = await conn.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${q} IS NULL)                             AS null_count,
      COUNT(*) FILTER (WHERE ${q} IS NOT NULL AND ST_IsEmpty(${q}))   AS empty_count
    FROM data
  `);
  const nullRow = nullResult.toArray()[0] as Record<string, unknown>;
  const nullCount = Number(nullRow.null_count);
  const emptyCount = Number(nullRow.empty_count);

  if (nullCount > 0) {
    violations.push(
      `${nullCount} feature(s) have a null geometry. Every feature MUST have a non-empty geometry.`,
    );
  }
  if (emptyCount > 0) {
    violations.push(
      `${emptyCount} feature(s) have an empty geometry. Every feature MUST have a non-empty geometry.`,
    );
  }

  // ── 2. Geometry validity ──────────────────────────────────────────────────
  const validResult = await conn.query(`
    SELECT COUNT(*) FILTER (WHERE NOT ST_IsValid(${q})) AS invalid_count
    FROM data
    WHERE ${q} IS NOT NULL
  `);
  const validRow = validResult.toArray()[0] as Record<string, unknown>;
  const invalidCount = Number(validRow.invalid_count);
  if (invalidCount > 0) {
    violations.push(
      `${invalidCount} geometry(ies) are invalid (e.g. self-intersections, unclosed rings). ` +
        "All geometries MUST be valid per the OGC Simple Features specification.",
    );
  }

  // ── 3. CRS / SRID ────────────────────────────────────────────────────────
  // ST_SRID is unavailable in DuckDB-WASM; use coordinate-range heuristic.
  const bboxResult = await conn.query(`
    SELECT
      MIN(ST_XMin(${q})) AS xmin,
      MAX(ST_XMax(${q})) AS xmax,
      MIN(ST_YMin(${q})) AS ymin,
      MAX(ST_YMax(${q})) AS ymax
    FROM data
    WHERE ${q} IS NOT NULL
  `);
  const bbox = bboxResult.toArray()[0] as Record<string, unknown>;
  const xmin = Number(bbox.xmin);
  const xmax = Number(bbox.xmax);
  const ymin = Number(bbox.ymin);
  const ymax = Number(bbox.ymax);

  if (isFinite(xmin) && isFinite(xmax) && isFinite(ymin) && isFinite(ymax)) {
    if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) {
      violations.push(
        `Coordinate bounds (x: [${xmin.toFixed(4)}, ${xmax.toFixed(4)}], y: [${ymin.toFixed(4)}, ${ymax.toFixed(4)}]) ` +
          "exceed WGS 84 ranges (x: [-180, 180], y: [-90, 90]). " +
          "All datasets MUST use EPSG:4326 (WGS 84).",
      );
    } else {
      info.push("Coordinate bounds are consistent with EPSG:4326 (WGS 84).");
    }
  }

  return { passed: violations.length === 0, violations, warnings, info };
}

export const checkGeometry: Check = {
  name: "check_geometry",
  label: "Geometry",
  specSection: "Geometry",
  appliesTo: ["all"],
  run,
};
