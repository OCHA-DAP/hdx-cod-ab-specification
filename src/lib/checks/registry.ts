import { checkDates } from './check_dates.ts';
import { checkGeometry } from './check_geometry.ts';
import { checkPolygon } from './check_polygon.ts';
import { checkTopology } from './check_topology.ts';
import { checkVersions } from './check_versions.ts';
import type { Check } from './types.ts';

/**
 * Ordered list of all registered validation checks.
 *
 * To add a new check:
 *   1. Create src/lib/checks/check_<name>.ts implementing the Check interface
 *   2. Import it here and add it to this array
 *   Nothing else needs to change.
 */
export const checks: Check[] = [
  checkGeometry,
  checkPolygon,
  checkTopology,
  checkVersions,
  checkDates,
];
