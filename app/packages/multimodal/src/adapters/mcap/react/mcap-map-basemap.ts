import type { SourceSpecification, StyleSpecification } from "maplibre-gl";
import {
  MCAP_MAP_BASE_LAYER,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  OPENFREEMAP_PROVIDER_NAME,
  type McapMapBaseLayer,
} from "./mcap-map-tile-state";

/** Layer used behind trajectories until a remote basemap is installed. */
export const MCAP_MAP_LOCAL_BACKGROUND_LAYER_ID = "mcap-location-background";

const MCAP_MAP_STYLE_ID_PREFIX = "mcap-location-";

/** Loading state for the selected map-tile basemap. */
export type McapMapBasemapStatus = "disabled" | "error" | "loading" | "ready";

let openFreeMapStylePromise: Promise<StyleSpecification> | null = null;

/** Returns the initial provider state for a selected basemap. */
export function initialMcapMapBasemapStatus(
  baseLayer: McapMapBaseLayer,
): McapMapBasemapStatus {
  return baseLayer === MCAP_MAP_BASE_LAYER.NONE ? "disabled" : "loading";
}

/** Returns provider-labelled user-facing status text when action is pending. */
export function mcapMapBasemapStatusText(
  status: McapMapBasemapStatus,
): string | null {
  if (status === "loading") {
    return `Loading basemap from ${OPENFREEMAP_PROVIDER_NAME}`;
  }
  if (status === "error") {
    return `Basemap unavailable from ${OPENFREEMAP_PROVIDER_NAME}`;
  }
  return null;
}

/**
 * Keeps the dependency-free route preview visible until the interactive map
 * is framed and its selected provider has loaded enough tiles to take over.
 */
export function shouldShowMcapMapStaticPreview({
  basemapStatus,
  cameraReady,
  failed,
  mapLoaded,
}: {
  readonly basemapStatus: McapMapBasemapStatus;
  readonly cameraReady: boolean;
  readonly failed: boolean;
  readonly mapLoaded: boolean;
}): boolean {
  return failed || !mapLoaded || !cameraReady || basemapStatus === "loading";
}

/**
 * Carries the live MCAP sources and layers into a replacement base style.
 * The local background is deliberately excluded so it cannot cover the
 * remote basemap after the swap.
 */
export function mergeMcapMapOverlaysIntoStyle(
  previousStyle: StyleSpecification | undefined,
  nextStyle: StyleSpecification,
): StyleSpecification {
  if (!previousStyle) return nextStyle;

  const overlaySources: Record<string, SourceSpecification> = {};
  for (const [id, source] of Object.entries(previousStyle.sources)) {
    if (isMcapMapOverlayStyleId(id)) overlaySources[id] = source;
  }
  const overlayLayers = previousStyle.layers.filter(({ id }) =>
    isMcapMapOverlayStyleId(id),
  );
  return {
    ...nextStyle,
    sources: { ...nextStyle.sources, ...overlaySources },
    layers: [
      ...nextStyle.layers.filter(({ id }) => !isMcapMapOverlayStyleId(id)),
      ...overlayLayers,
    ],
  };
}

/** Returns only the provider-owned source IDs from a basemap style. */
export function mcapMapBasemapSourceIds(
  style: StyleSpecification,
): readonly string[] {
  return Object.keys(style.sources).filter(
    (id) => !isMcapMapOverlayStyleId(id),
  );
}

/** Fetches only the style document; MapLibre loads its assets after install. */
export function loadOpenFreeMapStyle(): Promise<StyleSpecification> {
  if (!openFreeMapStylePromise) {
    openFreeMapStylePromise = fetch(OPENFREEMAP_LIBERTY_STYLE_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `OpenFreeMap style request failed with ${response.status}`,
          );
        }
        const style: unknown = await response.json();
        if (!isStyleSpecification(style)) {
          throw new Error("OpenFreeMap returned an invalid style document");
        }
        return style;
      })
      .catch((error: unknown) => {
        openFreeMapStylePromise = null;
        throw error;
      });
  }
  return openFreeMapStylePromise;
}

function isMcapMapOverlayStyleId(id: string): boolean {
  return (
    id.startsWith(MCAP_MAP_STYLE_ID_PREFIX) &&
    id !== MCAP_MAP_LOCAL_BACKGROUND_LAYER_ID
  );
}

function isStyleSpecification(value: unknown): value is StyleSpecification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StyleSpecification>;
  return (
    candidate.version === 8 &&
    candidate.sources !== null &&
    typeof candidate.sources === "object" &&
    Array.isArray(candidate.layers)
  );
}
