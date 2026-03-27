---
version: 0.1.0-draft
referenced_by: validator.md
---

# Codes

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
