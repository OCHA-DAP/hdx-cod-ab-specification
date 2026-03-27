---
version: 0.1.0-draft
referenced_by: validator.md
---

# Attributes

## Date Columns

| Column     | Type | Notes                                                                 |
| ---------- | ---- | --------------------------------------------------------------------- |
| `valid_on` | date | When this version of the data was last updated                        |
| `valid_to` | date | When this version was superseded; null if this is the current version |

All rows in a file MUST share the same `valid_on` and `valid_to` values (dates are constant per layer). `valid_on` MUST be non-null. `valid_to` MUST be null for the current (latest) version of a dataset and non-null for retired versions.

## Computed Columns

| Column       | Type   | Notes                                                         |
| ------------ | ------ | ------------------------------------------------------------- |
| `area_sqkm`  | double | Area of the polygon in square kilometres                      |
| `center_lat` | double | Latitude of a representative point guaranteed within polygon  |
| `center_lon` | double | Longitude of a representative point guaranteed within polygon |

These columns are added during the publishing pipeline and are not required in candidate datasets submitted for validation. Validators MUST NOT raise errors or warnings for absent computed columns.

These values are computed from the geometry. `area_sqkm` is computed in an equal-area projection (EPSG:6933). `center_lat` and `center_lon` are geographic coordinates (EPSG:4326) of a point guaranteed to be within the polygon.

`center_lat` and `center_lon` SHOULD be generated using a Maximum Inscribed Circle (MIC) algorithm, which finds the largest circle that fits inside the polygon and uses its center as the representative point. Implementations include DuckDB's [`ST_MaximumInscribedCircle`](https://duckdb.org/docs/stable/core_extensions/spatial/functions#st_maximuminscribedcircle) and GeoPandas' [`GeoSeries.maximum_inscribed_circle`](https://geopandas.org/en/stable/docs/reference/api/geopandas.GeoSeries.maximum_inscribed_circle.html). Many existing datasets use a simple centroid instead, which does not guarantee that the point falls within the polygon (e.g. for concave or donut-shaped polygons).

## Identifier Columns (Admin 0 only)

These columns are present only on admin level 0 files:

| Column | Type   | Max length | Notes                                       |
| ------ | ------ | ---------- | ------------------------------------------- |
| `iso2` | string | 2          | ISO 3166-1 alpha-2 country code, e.g. `AF`  |
| `iso3` | string | 3          | ISO 3166-1 alpha-3 country code, e.g. `AFG` |

> **Note:** `iso2` and `iso3` appear only in admin 0 files in current data. They SHOULD be included in higher admin levels to keep schemas consistent.

## Reference Name Column (Deprecated)

> **Deprecated:** The `adm{N}_ref_name` column (also seen as `adm{N}_ref_name1`) is deprecated and SHOULD NOT be included in new datasets. Existing data containing this column MUST NOT cause parsers to fail, but it should be omitted going forward.

| Column            | Type   | Notes                                                              |
| ----------------- | ------ | ------------------------------------------------------------------ |
| `adm{N}_ref_name` | string | Romanized or UN official reference name for the current-level unit |

This column, when present, contains the preferred reference name for the administrative unit at the current level (level N). It is typically the romanized Latin-script form when the primary script is non-Latin. Only the current level's ref name is included, not ancestors.
