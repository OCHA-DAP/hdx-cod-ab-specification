# COD-AB Validator

Validate UN OCHA administrative boundary files against the COD-AB specification — directly in your browser. No account, no upload, no server. Your files stay on your machine.

## How to use

1. Open the tool in your browser
2. Drop one or more boundary files onto the upload area
3. Click **Validate**
4. Review results per layer — each check shows passes, warnings, and violations with explanations

## Supported file formats

- Shapefiles (drop all sidecar files together: `.shp`, `.dbf`, `.shx`, `.prj`, `.cpg`)
- GeoPackage (`.gpkg`) — multi-layer files produce one result per layer
- GeoJSON
- FlatGeobuf
- Parquet / GeoParquet
- KML
- ZIP archives

## What gets checked

| Check | What it looks for |
| --- | --- |
| **Geometry** | Null or empty geometries; invalid geometries (self-intersections, unclosed rings); coordinates outside WGS 84 bounds |
| **Polygon type** | All features must be polygons or multipolygons (no points or lines) |
| **Topology** | Overlapping polygons; gaps (slivers) between adjacent polygons |
| **Version** | `version` column present; consistent across all rows; correct format (`v01`, `v02.01`, etc.) |
| **Dates** | `valid_on` and `valid_to` columns present and consistent; flags retired datasets |

Results include an interactive map preview with overlapping areas and gaps highlighted.

## Validating with an LLM

The tool includes a **Copy prompt** button that copies a self-contained validation prompt to your clipboard. Paste it into Claude, ChatGPT, or any other LLM to get guided feedback on your dataset.

## Specification

Click **View specification** in the app to browse the full COD-AB boundary spec, including column schemas for names, codes, attributes, geometry, and versioning.
