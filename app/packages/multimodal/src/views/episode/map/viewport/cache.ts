const MAX_VIEWPORT_SCOPES = 16;

/** Serializable map camera state retained between nearby modal samples. */
export interface MapViewport {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
}

const viewportByScope = new Map<string, MapViewport>();

/** Whether a live camera may stay visible while switching episode samples. */
export function canPreserveMapViewportBetweenSamples(
  previousScopeKey: string | null,
  nextScopeKey: string | null,
): boolean {
  return (
    previousScopeKey !== null &&
    nextScopeKey !== null &&
    previousScopeKey === nextScopeKey
  );
}

/** Reads and promotes the most recent viewport for a dataset scope. */
export function readMapViewport(scopeKey: string | null): MapViewport | null {
  if (!scopeKey) return null;
  const viewport = viewportByScope.get(scopeKey);
  if (!viewport) return null;

  viewportByScope.delete(scopeKey);
  viewportByScope.set(scopeKey, viewport);
  return { ...viewport };
}

/** Stores a valid viewport in the bounded, memory-only scope cache. */
export function writeMapViewport(
  scopeKey: string | null,
  viewport: MapViewport,
): void {
  if (!scopeKey || !isValidViewport(viewport)) return;

  viewportByScope.delete(scopeKey);
  viewportByScope.set(scopeKey, { ...viewport });
  while (viewportByScope.size > MAX_VIEWPORT_SCOPES) {
    const oldest = viewportByScope.keys().next().value as string | undefined;
    if (oldest === undefined) return;
    viewportByScope.delete(oldest);
  }
}

/** Clears all cached viewports between tests. */
export function resetMapViewportCacheForTests(): void {
  viewportByScope.clear();
}

function isValidViewport(viewport: MapViewport): boolean {
  return (
    Number.isFinite(viewport.latitude) &&
    viewport.latitude >= -90 &&
    viewport.latitude <= 90 &&
    Number.isFinite(viewport.longitude) &&
    viewport.longitude >= -180 &&
    viewport.longitude <= 180 &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom >= 0 &&
    viewport.zoom <= 24
  );
}
