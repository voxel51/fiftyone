type MapLibreMap = import("maplibre-gl").Map;

/** Stable GeoJSON source ids shared by map installation and updates. */
export const HIT_SOURCE_ID = "episode-location-hit-points";
export const CURRENT_SOURCE_ID = "episode-location-current";
export const HOVER_SOURCE_ID = "episode-location-hover";
export const MEASURE_LINE_SOURCE_ID = "episode-location-measure-line";
export const MEASURE_PREVIEW_SOURCE_ID = "episode-location-measure-preview";
export const MEASURE_POINTS_SOURCE_ID = "episode-location-measure-points";

/** Stable interaction layer ids shared by map installation and handlers. */
export const HIT_LAYER_ID = "episode-location-hit-points";
export const ACCURACY_LAYER_ID = "episode-location-accuracy";
export const PULSE_LAYER_ID = "episode-location-pulse";

const PUCK_LAYER_ID = "episode-location-puck";
const HOVER_LAYER_ID = "episode-location-hover";
const MEASURE_LINE_LAYER_ID = "episode-location-measure-line";
const MEASURE_PREVIEW_LAYER_ID = "episode-location-measure-preview";
const MEASURE_POINTS_LAYER_ID = "episode-location-measure-points";
const MEASURE_COLOR = "#22d3ee";
const MAX_STYLE_ZOOM = 22;

/** Installs the stable GeoJSON sources and interaction layers for one map. */
export function addMapSourcesAndLayers(map: MapLibreMap): void {
  addGeoJsonSource(map, HIT_SOURCE_ID);
  addGeoJsonSource(map, CURRENT_SOURCE_ID);
  addGeoJsonSource(map, HOVER_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_LINE_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_PREVIEW_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_POINTS_SOURCE_ID);

  map.addLayer({
    id: ACCURACY_LAYER_ID,
    type: "circle",
    source: CURRENT_SOURCE_ID,
    filter: ["has", "accuracyPx0"],
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.12,
      "circle-pitch-alignment": "map",
      "circle-radius": [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        0,
        ["get", "accuracyPx0"],
        MAX_STYLE_ZOOM,
        ["*", ["get", "accuracyPx0"], 2 ** MAX_STYLE_ZOOM],
      ],
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-opacity": 0.4,
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: PULSE_LAYER_ID,
    type: "circle",
    source: CURRENT_SOURCE_ID,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0,
      "circle-radius": 10,
    },
  });
  map.addLayer({
    id: HOVER_LAYER_ID,
    type: "circle",
    source: HOVER_SOURCE_ID,
    paint: {
      "circle-color": "#f8fafc",
      "circle-radius": 5,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: MEASURE_PREVIEW_LAYER_ID,
    type: "line",
    source: MEASURE_PREVIEW_SOURCE_ID,
    paint: {
      "line-color": MEASURE_COLOR,
      "line-dasharray": [1.2, 1.2],
      "line-opacity": 0.9,
      "line-width": 2,
    },
  });
  map.addLayer({
    id: MEASURE_LINE_LAYER_ID,
    type: "line",
    source: MEASURE_LINE_SOURCE_ID,
    paint: {
      "line-color": MEASURE_COLOR,
      "line-opacity": 0.95,
      "line-width": 2.5,
    },
  });
  map.addLayer({
    id: MEASURE_POINTS_LAYER_ID,
    type: "circle",
    source: MEASURE_POINTS_SOURCE_ID,
    paint: {
      "circle-color": MEASURE_COLOR,
      "circle-radius": 4.5,
      "circle-stroke-color": "#06101a",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: HIT_LAYER_ID,
    type: "circle",
    source: HIT_SOURCE_ID,
    paint: { "circle-opacity": 0, "circle-radius": 8 },
  });
  map.addLayer({
    id: PUCK_LAYER_ID,
    type: "symbol",
    source: CURRENT_SOURCE_ID,
    layout: {
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-image": ["get", "icon"],
      "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map",
    },
  });
}

function addGeoJsonSource(map: MapLibreMap, sourceId: string): void {
  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
}
