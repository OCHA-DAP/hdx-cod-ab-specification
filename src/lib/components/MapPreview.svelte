<script lang="ts">
  import type { PreviewData } from "$lib/db/loader";
  import type { Map as MaplibreMap } from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import { onDestroy, onMount } from "svelte";

  let { preview }: { preview: PreviewData } = $props();

  let container: HTMLDivElement | undefined;
  let map: MaplibreMap | undefined;
  let blobUrl: string | undefined;

  onMount(async () => {
    if (!container) return;

    blobUrl = URL.createObjectURL(preview.blob);

    // Dynamic import keeps maplibre-gl's bundled internals out of Svelte 5's
    // compilation scope, avoiding a $$props variable name conflict.
    const maplibregl = await import("maplibre-gl");

    map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#f3f4f6" },
          },
        ],
      },
      center: [0, 0],
      zoom: 1,
      attributionControl: false,
    });

    map.on("load", () => {
      if (!map) return;

      map.addSource("preview", { type: "geojson", data: blobUrl! });

      map.addLayer({
        id: "preview-fill",
        type: "fill",
        source: "preview",
        filter: [
          "match",
          ["geometry-type"],
          ["Polygon", "MultiPolygon"],
          true,
          false,
        ],
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.25 },
      });

      map.addLayer({
        id: "preview-line",
        type: "line",
        source: "preview",
        filter: [
          "match",
          ["geometry-type"],
          ["Polygon", "MultiPolygon", "LineString", "MultiLineString"],
          true,
          false,
        ],
        paint: { "line-color": "#1d4ed8", "line-width": 1 },
      });

      map.addLayer({
        id: "preview-circle",
        type: "circle",
        source: "preview",
        filter: [
          "match",
          ["geometry-type"],
          ["Point", "MultiPoint"],
          true,
          false,
        ],
        paint: { "circle-color": "#1d4ed8", "circle-radius": 4 },
      });

      if (preview.bounds) {
        const [minLng, minLat, maxLng, maxLat] = preview.bounds;
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 24, animate: false },
        );
      }
    });
  });

  onDestroy(() => {
    map?.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  });
</script>

<div bind:this={container} class="map"></div>

<style>
  .map {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
    margin-bottom: 0.75rem;
    overflow: hidden;
  }
</style>
