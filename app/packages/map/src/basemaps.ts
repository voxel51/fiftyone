const OPENFREEMAP_STYLE_BASE_URL = "https://tiles.openfreemap.org/styles";
const MAPBOX_STYLE_BASE_URL = "mapbox://styles/mapbox";

export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

export type MapProvider = "mapbox" | "maplibre";

export const MAPLIBRE_STYLES = {
  Positron: "positron",
  Dark: "dark",
  Liberty: "liberty",
  Bright: "bright",
  Fiord: "fiord",
} as const;

export const MAPBOX_STYLES = {
  Street: "streets-v11",
  Dark: "dark-v10",
  Light: "light-v10",
  Outdoors: "outdoors-v11",
  Satellite: "satellite-v9",
} as const;

export function getMapProvider(mapboxAccessToken?: string): MapProvider {
  return mapboxAccessToken ? "mapbox" : "maplibre";
}

export function getMapStyles(provider: MapProvider): string[] {
  return Object.keys(provider === "mapbox" ? MAPBOX_STYLES : MAPLIBRE_STYLES);
}

export function getMapStyleUrl(provider: MapProvider, style: string): string {
  if (provider === "mapbox") {
    const styleId = Object.hasOwn(MAPBOX_STYLES, style)
      ? MAPBOX_STYLES[style as keyof typeof MAPBOX_STYLES]
      : MAPBOX_STYLES.Light;
    return `${MAPBOX_STYLE_BASE_URL}/${styleId}`;
  }

  const styleId = Object.hasOwn(MAPLIBRE_STYLES, style)
    ? MAPLIBRE_STYLES[style as keyof typeof MAPLIBRE_STYLES]
    : MAPLIBRE_STYLES.Positron;
  return `${OPENFREEMAP_STYLE_BASE_URL}/${styleId}`;
}
