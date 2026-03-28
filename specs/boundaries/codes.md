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

P-codes (place codes) are alphanumeric strings identifying administrative units. They are semantic identifiers optimised for human readability: the country code and hierarchical structure are visible in the code itself. Each administrative unit MUST have exactly one P-code. P-codes MUST be unique within their administrative level. P-codes MUST be hierarchically nested: `adm{L}_pcode` MUST start with `adm{L-1}_pcode` for all L > 0. P-codes MUST be alphanumeric only (letters and digits, no spaces or special characters).

P-codes MUST be stored and exchanged without delimiters. Delimited forms such as `SS.01.01` or `SS-01-01` MUST NOT appear in data columns. Delimiters may be introduced by a presentation layer for readability but cannot be reliably reversed without out-of-band knowledge of each country's digit-width conventions, which vary by country and level.

The admin 0 p-code (`adm0_pcode`) SHOULD equal the country's [ISO 3166-1 alpha-2](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code (e.g., `AF` for Afghanistan). Alpha-2 is preferred because the country code prefixes all sub-national codes, so a shorter prefix keeps the full hierarchy compact. Some older datasets use [ISO 3166-1 alpha-3](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3) instead (e.g., `BDI` for Burundi); validators MUST accept this but SHOULD warn about it.

### Global identifiers

P-codes are only guaranteed unique within a given dataset version; they are not globally stable machine identifiers. Admin boundaries change frequently due to elections, conflicts, and administrative reform, so cross-version stability requires an opaque identifier outside the scope of this specification.

Until global identifiers are available, a composite key MAY be formed by appending `version` to the P-code (e.g. `CO05001v02`). The trailing digit and leading `v` make the boundary unambiguous. It will not collide across versions but cannot serve as a persistent reference, since the same unit gets a different composite in each version.

### Relationship to Government Codes

P-codes SHOULD be derived from official government codes where they exist. Government codes are typically zero-padded numeric strings; these are appended to the ISO alpha-2 country code to form the P-code. P-codes MUST be typed as strings to preserve leading zeros that would be lost if treated as integers. The government's existing digit width and padding MUST be reproduced exactly.

Examples from well-documented systems:

- **[US FIPS](https://www2.census.gov/programs-surveys/decennial/2010/partners/pdf/FIPS_StateCounty_Code.pdf)** (United States Census Bureau): States have 2-digit FIPS codes and counties have 3-digit codes within each state. California is `06`; Los Angeles County is `037` within California. The resulting P-codes are `US06` (admin 1) and `US06037` (admin 2).
- **[DIVIPOLA](https://www.datos.gov.co/api/views/gdxc-w37w/rows.pdf?accessType=DOWNLOAD)** (Colombia, DANE): Departments have 2-digit codes and municipalities have 3-digit codes within each department. Antioquia is `05`; Medellín is `001` within Antioquia. The resulting P-codes are `CO05` (admin 1) and `CO05001` (admin 2).
- **[IEBC county codes](https://www.iebc.or.ke/uploads/resources/LQei86kCJV.pdf)** (Kenya): Counties are numbered 001–047. The resulting P-codes are `KE001` (Mombasa County, admin 1) and `KE047` (Nairobi City County, admin 1).
- **[INEC LGA codes](https://www.inecnigeria.org/wp-content/uploads/2019/02/RA-LGA-ANALYSIS-NATIONWIDE.pdf)** (Nigeria): States are numbered 01–37; LGAs within each state are numbered 01–NN (2 digits, as no state has more than 44 LGAs). Borno State is `08`; its 27 LGAs run from `01` (Abadam) to `27` (Shani), with Maiduguri at `21`. The resulting P-codes are `NG08` (Borno State, admin 1) and `NG0821` (Maiduguri LGA, admin 2).

### Fallback When No Government Codes Exist

When no official government coding system exists, units SHOULD be sorted alphanumerically by name and assigned sequential numbers. The digit width is determined independently for each admin level within a country: the numeric portion MUST use the minimum number of digits required to represent the largest number of units found within any single parent unit at that level, with zero-padding applied consistently across all codes at that level.

For example, Uganda (`UG`) has 4 administrative regions at admin 1, and the maximum number of child units per parent decreases as units become more granular:

| Admin level | Unit type    | Max units per parent | Digit width | Example codes                           |
| ----------- | ------------ | -------------------- | ----------- | --------------------------------------- |
| Admin 1     | Regions      | 4                    | 1           | `UG1`, `UG2`, `UG3`, `UG4`              |
| Admin 2     | Districts    | 40                   | 2           | `UG101`, `UG102`, … `UG440`             |
| Admin 3     | Sub-counties | 20                   | 2           | `UG10101`, `UG10102`, … `UG44020`       |
| Admin 4     | Parishes     | 15                   | 2           | `UG1010101`, `UG1010102`, … `UG4402015` |

Admin 3 and admin 4 both use two digits here because no parent at either level contains more than 99 child units.

### Continuity Across Versions

P-codes SHOULD remain stable across dataset versions. When a government introduces a substantially new boundary system, p-codes SHOULD follow the new system even if continuity is broken. A retired P-code SHOULD NOT be reused for a different administrative unit.

Continuity SHOULD also be broken when a restructuring changes the number of units enough that preserving old codes would produce over-engineered results. For example, Uganda previously had 128 administrative level 1 districts with codes like `UG101` and `UG432`; after restructuring to a small number of regions, forcing continuity would produce codes like `UG001` or `UG100` rather than the clean `UG1`, `UG2` that the digit-width rule would naturally yield. In such cases the p-code system SHOULD be reset.
