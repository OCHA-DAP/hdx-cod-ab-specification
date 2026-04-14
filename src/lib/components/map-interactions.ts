import { Popup, type Map as MaplibreMap, type PointLike } from "maplibre-gl";

const HIT_RADIUS = 4; // px around cursor to query

function buildTooltipHtml(properties: Record<string, unknown> | null): string {
  if (!properties) return '<em class="tt-empty">No attributes</em>';
  const entries = Object.entries(properties);
  if (entries.length === 0) return '<em class="tt-empty">No attributes</em>';
  const rows = entries
    .map(
      ([k, v]) =>
        `<tr><td class="tt-key">${k}</td><td class="tt-val">${v == null ? "" : String(v)}</td></tr>`,
    )
    .join("");
  return `<table>${rows}</table>`;
}

export function setupHoverTooltip(
  map: MaplibreMap,
  layers: string[],
  getEnabled: () => boolean,
): void {
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    className: "preview-tooltip",
  });
  popup.trackPointer();

  map.on("mousemove", (e) => {
    const box: [PointLike, PointLike] = [
      [e.point.x - HIT_RADIUS, e.point.y - HIT_RADIUS],
      [e.point.x + HIT_RADIUS, e.point.y + HIT_RADIUS],
    ];
    const features = map.queryRenderedFeatures(box, { layers });

    if (features.length === 0) {
      map.getCanvas().style.cursor = "";
      popup.remove();
      return;
    }

    map.getCanvas().style.cursor = "pointer";
    if (!getEnabled()) {
      popup.remove();
      return;
    }

    const html = buildTooltipHtml(features[0].properties);
    popup.setHTML(html).addTo(map);
  });

  map.on("mouseout", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
}
