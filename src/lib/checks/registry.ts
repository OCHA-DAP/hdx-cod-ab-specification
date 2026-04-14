import { checkContainment } from "./check-containment.ts";
import { checkDates } from "./check-dates.ts";
import { checkGeometry } from "./check-geometry.ts";
import { checkLang } from "./check-lang.ts";
import { checkNames } from "./check-names.ts";
import { checkPcodeFormat } from "./check-pcode-format.ts";
import { checkPcodeRefs } from "./check-pcode-refs.ts";
import { checkPolygon } from "./check-polygon.ts";
import { checkTopology } from "./check-topology.ts";
import { checkVersions } from "./check-versions.ts";
import type { Check, HierarchyCheck } from "./types.ts";

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
  checkPcodeFormat,
  checkPcodeRefs,
  checkNames,
  checkLang,
  checkDates,
  checkVersions,
];

/**
 * Ordered list of all registered hierarchy checks (cross-layer, pair-based).
 *
 * To add a new hierarchy check:
 *   1. Create src/lib/checks/check_<name>.ts implementing the HierarchyCheck interface
 *   2. Import it here and add it to this array
 *   Nothing else needs to change.
 */
export const hierarchyChecks: HierarchyCheck[] = [checkContainment];
