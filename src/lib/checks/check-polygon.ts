import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { findGeomColumn } from "./check-geometry.ts";
import type { Check, CheckResult } from "./types.ts";

async function run(conn: AsyncDuckDBConnection, _columns: string[]): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const geomCol = await findGeomColumn(conn);
  if (!geomCol) {
    return { passed: true, violations, warnings, info };
  }

  const q = JSON.stringify(geomCol);

  const typeResult = await conn.query(`
    SELECT ST_GeometryType(${q})::VARCHAR AS geom_type, COUNT(*) AS cnt
    FROM data
    WHERE ${q} IS NOT NULL
    GROUP BY geom_type
    ORDER BY geom_type
  `);
  const typeCounts = typeResult.toArray() as Array<{ geom_type: string; cnt: bigint }>;
  const badTypes = typeCounts.filter(
    (r) => r.geom_type !== "POLYGON" && r.geom_type !== "MULTIPOLYGON",
  );
  if (badTypes.length > 0) {
    const listed = badTypes.map((r) => `${r.geom_type} (${r.cnt})`).join(", ");
    violations.push(
      `Non-polygon geometry types found: ${listed}. All geometries MUST be of type Polygon or MultiPolygon.`,
    );
  }

  return { passed: violations.length === 0, violations, warnings, info };
}

export const checkPolygon: Check = {
  name: "check_polygon",
  label: "Polygon",
  specSection: "Geometry",
  appliesTo: ["admin"],
  run,
};
