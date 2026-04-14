import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { Check, CheckResult } from "./types.ts";

const OVERLAP_FEATURE_LIMIT = 2000;

async function findGeomColumn(conn: AsyncDuckDBConnection): Promise<string | null> {
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
    info.push("No GEOMETRY column found — topology checks skipped.");
    return { passed: true, violations, warnings, info };
  }

  const q = JSON.stringify(geomCol);
  const overlapFeatures: string[] = [];
  const gapFeatures: string[] = [];

  // ── 1. Overlaps ────────────────────────────────────────────────────────────
  // Use a row-numbered self-join to find pairs sharing interior area.
  // ST_Intersects AND NOT ST_Touches catches both partial overlaps and
  // containment (one polygon fully inside another).
  const countResult = await conn.query(`SELECT COUNT(*) AS n FROM data WHERE ${q} IS NOT NULL`);
  const featureCount = Number((countResult.toArray()[0] as Record<string, unknown>).n);

  if (featureCount > OVERLAP_FEATURE_LIMIT) {
    warnings.push(
      `Layer has ${featureCount} features — overlap check skipped (limit: ${OVERLAP_FEATURE_LIMIT}). ` +
        "Polygons within a layer MUST NOT overlap each other.",
    );
  } else {
    // Retrieve intersection geometries directly — the row count is the overlap count.
    const overlapResult = await conn.query(`
      WITH indexed AS (
        SELECT row_number() OVER () AS rn, ${q} AS geom
        FROM data
        WHERE ${q} IS NOT NULL
      )
      SELECT TRY(ST_AsGeoJSON(ST_Intersection(a.geom, b.geom))) AS g
      FROM indexed a
      JOIN indexed b ON a.rn < b.rn
      WHERE ST_Intersects(a.geom, b.geom)
        AND NOT ST_Touches(a.geom, b.geom)
    `);
    for (const row of overlapResult.toArray()) {
      const g = (row as Record<string, unknown>).g;
      if (g != null) {
        overlapFeatures.push(
          `{"type":"Feature","geometry":${g},"properties":{"issueType":"overlap"}}`,
        );
      }
    }
    if (overlapFeatures.length > 0) {
      violations.push(
        `${overlapFeatures.length} pair(s) of polygons overlap. ` +
          "Polygons within a layer MUST NOT overlap each other.",
      );
    } else {
      info.push("No overlapping polygons detected.");
    }
  }

  // ── 2. Gaps ────────────────────────────────────────────────────────────────
  // Union all polygons and extract interior rings (holes) — each hole is a gap.
  // We parse the GeoJSON in JS to both count holes and build visualisation features.
  const gapResult = await conn.query(`
    SELECT
      ST_GeometryType(ST_Union_Agg(${q}))::VARCHAR AS geom_type,
      ST_AsGeoJSON(ST_Union_Agg(${q}))             AS gj
    FROM data
    WHERE ${q} IS NOT NULL
  `);
  const gapRow = gapResult.toArray()[0] as Record<string, unknown>;
  const gjStr = gapRow.gj != null ? String(gapRow.gj) : null;
  const geomType = String(gapRow.geom_type ?? "");

  let gapRingCount = 0;
  if (gjStr) {
    try {
      const geom = JSON.parse(gjStr) as {
        type: string;
        coordinates: number[][][];
      };
      if (geomType === "POLYGON") {
        gapRingCount = geom.coordinates.length - 1;
        for (let i = 1; i < geom.coordinates.length; i++) {
          gapFeatures.push(
            `{"type":"Feature","geometry":{"type":"Polygon","coordinates":${JSON.stringify([geom.coordinates[i]])}},"properties":{"issueType":"gap"}}`,
          );
        }
      } else if (geomType === "MULTIPOLYGON") {
        const mpCoords = geom.coordinates as unknown as number[][][][];
        for (const poly of mpCoords) {
          gapRingCount += poly.length - 1;
          for (let i = 1; i < poly.length; i++) {
            gapFeatures.push(
              `{"type":"Feature","geometry":{"type":"Polygon","coordinates":${JSON.stringify([poly[i]])}},"properties":{"issueType":"gap"}}`,
            );
          }
        }
      }
    } catch {
      // JSON parse failed — gap count stays 0, no visualisation features
    }
  }

  if (gapRingCount > 0) {
    violations.push(
      `${gapRingCount} gap(s) detected between adjacent polygons. ` +
        "There MUST be no gaps (slivers) between adjacent polygons within a layer.",
    );
  } else {
    info.push("No gaps detected between polygons.");
  }

  // ── Overlay GeoJSON ────────────────────────────────────────────────────────
  const allFeatures = [...overlapFeatures, ...gapFeatures];
  const overlayGeojson =
    allFeatures.length > 0
      ? `{"type":"FeatureCollection","features":[${allFeatures.join(",")}]}`
      : undefined;

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    info,
    overlayGeojson,
  };
}

export const checkTopology: Check = {
  name: "check_topology",
  label: "Topology",
  specSection: "Topology",
  appliesTo: ["admin", "lines"],
  run,
};
