# Codes

Version: 0.1.0-draft

## P-Code Columns

For each level L (0 ≤ L ≤ N):

| Column         | Type   | Max length | Notes                                             |
| -------------- | ------ | ---------- | ------------------------------------------------- |
| `adm{L}_pcode` | string | 20         | Place code for the administrative unit at level L |

P-codes (place codes) are alphanumeric strings that uniquely identify an administrative unit. P-codes MUST be hierarchically nested: `adm{L}_pcode` MUST start with `adm{L-1}_pcode` for all L > 0. All p-codes in a column MUST be unique within the file (no duplicates at the same level). P-codes MUST be alphanumeric only (letters and digits, no spaces or special characters).

The admin 0 p-code (`adm0_pcode`) SHOULD equal the country's [ISO 3166-1 alpha-2](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code (e.g., `AF` for Afghanistan).

### Relationship to Government Codes

P-codes SHOULD be derived from official government codes where they exist. Government codes are typically zero-padded numeric strings (e.g., `01`, `02`). The ISO 3166-1 alpha-2 country code is prepended to form the p-code (e.g., `AF01`, `AF02`). P-codes MUST be typed as strings to preserve leading zeros that would be lost if treated as integers. The government's existing digit width and padding MUST be reproduced exactly.

### Fallback When No Government Codes Exist

When no official government coding system exists, units SHOULD be sorted alphanumerically by name and assigned sequential numbers. The digit width is determined independently for each admin level within a country: the numeric portion MUST use the minimum number of digits required to represent the largest number of units found within any single parent unit at that level, with zero-padding applied consistently across all codes at that level.

For example, Uganda (`UG`) has 4 administrative regions at admin 1, and the maximum number of child units per parent decreases as units become more granular:

| Admin level | Unit type    | Max units per parent | Digit width | Example codes                           |
| ----------- | ------------ | -------------------- | ----------- | --------------------------------------- |
| Admin 1     | Regions      | 4                    | 1           | `UG1`, `UG2`, `UG3`, `UG4`              |
| Admin 2     | Districts    | 40                   | 2           | `UG101`, `UG102`, … `UG440`             |
| Admin 3     | Sub-counties | 20                   | 2           | `UG10101`, `UG10102`, … `UG44020`       |
| Admin 4     | Parishes     | 15                   | 2           | `UG1010101`, `UG1010102`, … `UG4402015` |

Each level's digit width is set independently by the largest sibling group at that level, not the total count across all parents. Admin 3 and admin 4 both use two digits here because no parent at either level contains more than 99 child units.

### Continuity Across Versions

P-codes SHOULD maintain continuity with the previous dataset version so that codes remain stable across updates. Continuity MAY not be achievable when the government introduces a substantially new boundary system, in which case the p-codes SHOULD follow the new government codes.

## Version Column

| Column    | Type   | Notes                                  |
| --------- | ------ | -------------------------------------- |
| `version` | string | Version string, e.g. `v01` or `v02.01` |

`version` MUST be present in all datasets. The version string follows one of two formats:

- **Major version** (`v{NN}`): used when the change status is major (e.g. `v03`).
- **Minor version** (`v{NN}.{NN}`): used when the change status is minor (e.g. `v02.01`).

The major component is zero-padded to two digits and starts at `v01`. The minor component is also zero-padded to two digits and resets to `01` on each major increment.

### Major Version

A major version MUST be assigned when the update introduces changes that may break existing joins, scripts, dashboards, or maps — i.e. downstream consumers cannot simply auto-refresh. The following changes MUST trigger a major version:

- Boundary geometry has been redrawn, merged, or split (new delimitations or realignments)
- A new administrative level has been introduced, or existing levels have been reclassified
- The number of records has changed (administrative units added or removed)
- P-codes have been significantly reassigned or renumbered across most units
- Administrative unit names have been significantly renamed or updated
- Attribute schema has changed (fields added, removed, or renamed)

### Minor Version

A minor version MUST be assigned for corrections that do not affect boundary definitions, record counts, or the coding structure, and that allow downstream systems to auto-refresh without disruption. The following changes MUST trigger a minor version:

- Minor topology fixes (e.g. healing overlaps, removing slivers)
- Small-scale coordinate corrections (e.g. coastline adjustments, capital point locations)
- Adding or updating a small number of supplementary features (e.g. admin centroids, capital points, admin lines)
- Populating missing attribute values
- Correcting spelling or formatting typos in attribute values
- Adding or correcting a small number of P-codes that do not affect existing downstream systems

> **Note:** Some older datasets use `cod_version` (e.g. `V_01`) instead of `version`. This is a legacy variant and SHOULD be updated to `version` when datasets are revised.
