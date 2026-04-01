import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { CheckResult, HierarchyCheck, LayerContext } from './types.ts';

/** Maximum child feature count before the containment sub-check is skipped. */
const CONTAINMENT_FEATURE_LIMIT = 5000;

/** Maximum number of polygon identifiers to list in a violation message. */
const MAX_IDS_SHOWN = 10;

async function findGeomColumn(
  conn: AsyncDuckDBConnection,
  tableName: string,
): Promise<string | null> {
  const desc = await conn.query(`DESCRIBE ${tableName}`);
  const cols = desc.toArray() as Array<{ column_name: string; column_type: string }>;
  return cols.find((r) => r.column_type === 'GEOMETRY')?.column_name ?? null;
}

/**
 * Returns a SQL expression and display label for the best available identifier
 * column at the given admin level. Prefers pcode, then name, then row number.
 */
function identifierExpr(
  columns: string[],
  level: number,
): { expr: string; label: string } {
  const pcode = `adm${level}_pcode`;
  if (columns.includes(pcode)) return { expr: `${JSON.stringify(pcode)}::VARCHAR`, label: pcode };
  const name = `adm${level}_name`;
  if (columns.includes(name)) return { expr: `${JSON.stringify(name)}::VARCHAR`, label: name };
  return { expr: 'rn::VARCHAR', label: 'row' };
}

/** Formats an array of IDs into a readable list with an overflow suffix. */
function formatIds(ids: unknown, label: string): string {
  const clean = Array.from(ids as Iterable<string | null>).filter((v): v is string => v != null);
  const shown = clean.slice(0, MAX_IDS_SHOWN);
  const extra = clean.length - shown.length;
  const list = shown.join(', ') + (extra > 0 ? ` (and ${extra} more)` : '');
  return `${label}: ${list}`;
}

async function run(
  conn: AsyncDuckDBConnection,
  parent: LayerContext,
  child: LayerContext,
): Promise<CheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const parentGeom = await findGeomColumn(conn, parent.tableName);
  const childGeom = await findGeomColumn(conn, child.tableName);

  if (!parentGeom || !childGeom) {
    info.push('No GEOMETRY column found in one or both layers — containment checks skipped.');
    return { passed: true, violations, warnings, info };
  }

  const pg = JSON.stringify(parentGeom);
  const cg = JSON.stringify(childGeom);
  const pt = parent.tableName;
  const ct = child.tableName;

  const childId = identifierExpr(child.columns, child.adminLevel);

  // ── Feature count guard ────────────────────────────────────────────────────
  const countResult = await conn.query(
    `SELECT COUNT(*) AS n FROM ${ct} WHERE ${cg} IS NOT NULL`,
  );
  const childCount = Number((countResult.toArray()[0] as Record<string, unknown>).n);

  // ── Sub-check A: Containment ───────────────────────────────────────────────
  // Each child polygon must overlap the interior of exactly one parent polygon.
  // ST_Intersects AND NOT ST_Touches detects interior overlap: shared boundary
  // edges are intentional and excluded. This distinguishes two failure modes:
  //   - orphan:           child doesn't overlap any parent interior at all
  //   - boundary crosser: child overlaps 2+ parent interiors (crosses a parent boundary)
  // ST_Overlaps is not used because it excludes full containment (child entirely
  // inside parent), which is a valid relationship we must not miss.
  if (childCount > CONTAINMENT_FEATURE_LIMIT) {
    warnings.push(
      `adm${child.adminLevel} has ${childCount} features — containment check skipped (limit: ${CONTAINMENT_FEATURE_LIMIT}).`,
    );
  } else {
    const containResult = await conn.query(`
      WITH numbered AS (
        SELECT row_number() OVER () AS rn, ${cg} AS geom, ${childId.expr} AS id
        FROM ${ct}
        WHERE ${cg} IS NOT NULL
      ),
      containment AS (
        SELECT
          c.rn,
          c.id,
          COUNT(p.${pg}) FILTER (
            WHERE ST_Intersects(c.geom, p.${pg}) AND NOT ST_Touches(c.geom, p.${pg})
          ) AS overlap_count
        FROM numbered c
        LEFT JOIN ${pt} p ON ST_Intersects(c.geom, p.${pg}) AND NOT ST_Touches(c.geom, p.${pg})
        GROUP BY c.rn, c.id
      )
      SELECT
        COUNT(*) FILTER (WHERE overlap_count = 0) AS orphan_count,
        COUNT(*) FILTER (WHERE overlap_count > 1) AS crosses_count,
        array_agg(id ORDER BY rn) FILTER (WHERE overlap_count = 0) AS orphan_ids,
        array_agg(id ORDER BY rn) FILTER (WHERE overlap_count > 1) AS crosses_ids
      FROM containment
    `);
    const row = containResult.toArray()[0] as Record<string, unknown>;
    const orphanCount = Number(row.orphan_count);
    const crossesCount = Number(row.crosses_count);
    const orphanIds = row.orphan_ids ?? [];
    const crossesIds = row.crosses_ids ?? [];

    if (orphanCount > 0) {
      violations.push(
        `${orphanCount} adm${child.adminLevel} polygon(s) do not overlap any adm${parent.adminLevel} polygon. ` +
          formatIds(orphanIds, childId.label),
      );
    }
    if (crossesCount > 0) {
      violations.push(
        `${crossesCount} adm${child.adminLevel} polygon(s) cross an adm${parent.adminLevel} boundary (overlapping into multiple adm${parent.adminLevel} areas). ` +
          formatIds(crossesIds, childId.label),
      );
    }
    if (orphanCount === 0 && crossesCount === 0) {
      info.push(
        `All adm${child.adminLevel} polygons are fully contained within exactly one adm${parent.adminLevel} polygon.`,
      );
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    info,
  };
}

export const checkContainment: HierarchyCheck = {
  name: 'check_containment',
  label: 'Layer Containment',
  specSection: 'Geometry',
  appliesToPair: 'adjacent-admin',
  run,
};
