import type { SourceSpecification, StyleSpecification } from "maplibre-gl";
import {
  MAP_BASE_LAYER,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  OPENFREEMAP_PROVIDER_NAME,
  type MapBaseLayer,
} from "./rendering/types";

/** Layer used behind trajectories until a remote basemap is installed. */
export const MAP_LOCAL_BACKGROUND_LAYER_ID = "episode-location-background";

const MAP_STYLE_ID_PREFIX = "episode-location-";

/** Loading state for the selected map-tile basemap. */
export type MapBasemapStatus = "disabled" | "error" | "loading" | "ready";

let openFreeMapStylePromise: Promise<StyleSpecification> | null = null;

/** Returns the initial provider state for a selected basemap. */
export function initialMapBasemapStatus(
  baseLayer: MapBaseLayer,
): MapBasemapStatus {
  return baseLayer === MAP_BASE_LAYER.NONE ? "disabled" : "loading";
}

/** Returns provider-labelled user-facing status text when action is pending. */
export function mapBasemapStatusText(status: MapBasemapStatus): string | null {
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
 * is framed. Basemap readiness must not cover a usable local map fallback.
 */
export function shouldShowMapStaticPreview({
  cameraReady,
  failed,
  mapLoaded,
}: {
  readonly cameraReady: boolean;
  readonly failed: boolean;
  readonly mapLoaded: boolean;
}): boolean {
  return failed || !mapLoaded || !cameraReady;
}

/**
 * Carries the live episode sources and layers into a replacement base style.
 * The local background is deliberately excluded so it cannot cover the
 * remote basemap after the swap.
 */
export function mergeMapOverlaysIntoStyle(
  previousStyle: StyleSpecification | undefined,
  nextStyle: StyleSpecification,
): StyleSpecification {
  if (!previousStyle) return nextStyle;

  const overlaySources: Record<string, SourceSpecification> = {};
  for (const [id, source] of Object.entries(previousStyle.sources)) {
    if (isMapOverlayStyleId(id)) overlaySources[id] = source;
  }
  const overlayLayers = previousStyle.layers.filter(({ id }) =>
    isMapOverlayStyleId(id),
  );
  return {
    ...nextStyle,
    sources: { ...nextStyle.sources, ...overlaySources },
    layers: [
      ...nextStyle.layers.filter(({ id }) => !isMapOverlayStyleId(id)),
      ...overlayLayers,
    ],
  };
}

/** Returns only the provider-owned source IDs from a basemap style. */
export function mapBasemapSourceIds(
  style: StyleSpecification,
): readonly string[] {
  return Object.keys(style.sources).filter((id) => !isMapOverlayStyleId(id));
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

function isMapOverlayStyleId(id: string): boolean {
  return (
    id.startsWith(MAP_STYLE_ID_PREFIX) && id !== MAP_LOCAL_BACKGROUND_LAYER_ID
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
