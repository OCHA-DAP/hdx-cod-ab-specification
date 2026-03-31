# Legacy

This document describes known deviations from the COD-AB specification present in existing datasets. These should be addressed in future releases.

## Non-Standard Columns

Datasets MAY include additional columns not defined in this specification (e.g., `regionname_en`, `regioncode`, `unittype`). Such columns MUST be placed after all standard columns and SHOULD be documented by the data producer. Parsers MUST NOT fail when encountering non-standard columns.

- **`cod_version` vs `version`**: Some datasets (those with `v_` in the directory name) use `cod_version` instead of `version`, and the value format differs (`V_01` vs `v01`).
- **`adm{N}_ref_name1`**: A few datasets use `adm{N}_ref_name1` instead of `adm{N}_ref_name`. These should be renamed.
- **`valid_to` timezone**: Some files store `valid_to` without a timezone, others with UTC. This should be standardised to always include UTC.
- **`center_lat`/`center_lon` missing**: A small number of files are missing these columns (e.g., `cod_ab_dza_v01`).
- **Non-standard columns**: Some files contain extra columns outside this spec (e.g., `regionname_en`, `regioncode`, `unittype` in Afghanistan admin 2).
- **Admin lines, points, and capitals**: These supplementary layers have inconsistent schemas across countries and are not yet fully standardised.
