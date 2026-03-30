---
version: 0.1.0-draft
referenced_by: validator.md
sources:
  - specs/boundaries/names.md
  - specs/boundaries/codes.md
  - specs/boundaries/versions.md
  - specs/boundaries/attributes.md
  - specs/boundaries/geometry.md
---

# COD-AB Specification

## Overview

The Common Operational Dataset – Administrative Boundaries (COD-AB) is a collection of administrative boundary datasets published by the United Nations Office for the Coordination of Humanitarian Affairs (UN OCHA). This specification defines the format and schema for the distribution of these datasets.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

## Background

COD-ABs are the authoritative administrative boundary datasets for humanitarian response. They are maintained on a country-by-country basis, versioned over time, and cover up to six administrative levels (Admin 0–5). Each country may have one or more versioned datasets.

## Admin Boundary Layers (`{iso3}_admin{N}`)

Each admin boundary file represents one administrative level for one country version. Every row in the file is a single administrative unit (polygon) at that level.

### Non-Standard Columns

Datasets MAY include additional columns not defined in this specification (e.g., `regionname_en`, `regioncode`, `unittype`). Such columns MUST be placed after all standard columns and SHOULD be documented by the data producer. Parsers MUST NOT fail when encountering non-standard columns.

### Column Order

Columns SHOULD appear in the following order within each file:

1. `adm{N}_name`, `adm{N}_name1`, `adm{N}_name2`, `adm{N}_name3`, `adm{N}_pcode` (current level, descending from N to 0)
2. Ancestor name and p-code columns (level N-1 down to 0)
3. `valid_on`, `valid_to`
4. `area_sqkm`, `version` (or `cod_version`)
5. `lang`, `lang1`, `lang2`, `lang3`
6. `adm{N}_ref_name` (if present)
7. `iso2`, `iso3` (admin 0 only)
8. `center_lat`, `center_lon`

## Cross-Layer Consistency

The lowest-level file is the authoritative source for names and p-codes. All higher-level files MUST be derived from it by selecting the distinct combinations of name and p-code columns for the relevant level.

## Known Deviations in Current Data

This specification describes the intended schema. The current dataset has the following known deviations that should be addressed in future releases:

- **`cod_version` vs `version`**: Some datasets (those with `v_` in the directory name) use `cod_version` instead of `version`, and the value format differs (`V_01` vs `v01`).
- **`adm{N}_ref_name1`**: A few datasets use `adm{N}_ref_name1` instead of `adm{N}_ref_name`. These should be renamed.
- **`valid_to` timezone**: Some files store `valid_to` without a timezone, others with UTC. This should be standardised to always include UTC.
- **`center_lat`/`center_lon` missing**: A small number of files are missing these columns (e.g., `cod_ab_dza_v01`).
- **Non-standard columns**: Some files contain extra columns outside this spec (e.g., `regionname_en`, `regioncode`, `unittype` in Afghanistan admin 2).
- **Admin lines, points, and capitals**: These supplementary layers have inconsistent schemas across countries and are not yet fully standardised.

## Appendix: Example Column Set

For an admin level 2 file with English primary and Dari secondary language:

```text
adm2_name         (string, primary name in English)
adm2_name1        (string, name in Dari, nullable)
adm2_name2        (string, nullable)
adm2_name3        (string, nullable)
adm2_pcode        (string, e.g. "AF1113")
adm1_name         (string, parent admin 1 name)
adm1_name1        (string, nullable)
adm1_name2        (string, nullable)
adm1_name3        (string, nullable)
adm1_pcode        (string, e.g. "AF11")
adm0_name         (string, country name)
adm0_name1        (string, nullable)
adm0_name2        (string, nullable)
adm0_name3        (string, nullable)
adm0_pcode        (string, e.g. "AF")
valid_on          (timestamp with timezone)
valid_to          (timestamp with timezone, nullable)
area_sqkm         (double)
version           (string, e.g. "v01")
lang              (string, e.g. "en")
lang1             (string, e.g. "da", nullable)
lang2             (string, nullable)
lang3             (string, nullable)
adm2_ref_name     (string, nullable)
center_lat        (double)
center_lon        (double)
```
