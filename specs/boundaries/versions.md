---
version: 0.1.0-draft
referenced_by: validator.md
---

# Versions

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
