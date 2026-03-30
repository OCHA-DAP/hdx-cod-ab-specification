## Geometry

### Coordinate Reference System

All layers MUST use the WGS 84 geographic coordinate system (EPSG:4326). Coordinates MUST be two-dimensional; 3D coordinates (with a Z value) MUST NOT be present.

### Geometry Type

Every feature MUST have a non-empty geometry. All geometries MUST be of type Polygon or MultiPolygon. Multipart geometries (MultiPolygon) MUST be used for administrative units that consist of multiple distinct polygons (e.g. a mainland area plus islands); such units MUST NOT be split across multiple rows.

### Geometry Validity

All geometries MUST be valid according to the OGC Simple Features specification. Invalid geometries (e.g. self-intersections, unclosed rings, duplicate vertices) MUST be corrected before publication.

### Topology

Within a single layer:

- Polygons MUST NOT overlap each other.
- There MUST be no gaps (slivers) between adjacent polygons.

Across layers:

- Each polygon at admin level N MUST be fully contained within exactly one polygon at admin level N−1.
- The boundary edges of child polygons MUST be coincident with the boundary of their parent polygon (no gaps or overlaps at layer boundaries).

A polygon's ancestor name and p-code attribute values MUST match the name and p-code of the parent polygon that spatially contains it.

### Area

Each feature's `area_sqkm` value MUST be the area of the feature's geometry measured in square kilometres, calculated using an equal-area projection. All features within a layer MUST share the same bounding box (i.e. the layer covers a consistent national extent). The layer MUST have a valid bounding box.
