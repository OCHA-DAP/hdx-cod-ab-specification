export type IssueFeature = {
  geometry: { type: string; coordinates?: unknown; geometries?: unknown[] };
  properties: { issueType: string };
};

export function parseOverlayFeatures(overlays: string[]): IssueFeature[] {
  return overlays.flatMap((s) => {
    try {
      const fc = JSON.parse(s) as { features: IssueFeature[] };
      return fc.features ?? [];
    } catch {
      return [];
    }
  });
}

function expandBounds(b: [number, number, number, number], coords: unknown): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    const [lng, lat] = coords as [number, number];
    if (lng < b[0]) b[0] = lng;
    if (lat < b[1]) b[1] = lat;
    if (lng > b[2]) b[2] = lng;
    if (lat > b[3]) b[3] = lat;
  } else {
    for (const c of coords) expandBounds(b, c);
  }
}

export function featureBounds(f: IssueFeature): [number, number, number, number] | null {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const geom = f.geometry;
  if (geom?.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
    for (const g of geom.geometries as IssueFeature["geometry"][]) {
      expandBounds(b, g?.coordinates);
    }
  } else {
    expandBounds(b, geom?.coordinates);
  }
  return isFinite(b[0]) ? b : null;
}
