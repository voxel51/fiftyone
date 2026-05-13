import type { TimelineTrackConfig } from "../../TimelineWithTracks/TimelineWithTracks";
import type { MockStreamBundle, MockStreamKind } from "./types";

/** Default track color per mock stream kind. */
export const TRACK_COLOR_BY_KIND: Record<MockStreamKind, string> = {
  camera: "#4a9eff",
  lidar: "#ff7c4a",
  scene: "#4aff9e",
  graph: "#ffd24a",
  json: "#a0a0a0",
};

const DEFAULT_EVENT_COUNT = 5;

/**
 * Build a sensible default `TimelineTrackConfig` for a stream bundle:
 *   - track id = stream id (so the ruler / overlays line up)
 *   - color is picked by `bundle.kind`
 *   - track spans the full stream duration
 *   - 5 evenly-spaced event markers so the bar isn't visually empty
 *
 * Stories that need bespoke track ranges or custom event arrays should
 * write their tracks by hand and pass them through directly.
 */
export function bundleToTrack(bundle: MockStreamBundle): TimelineTrackConfig {
  const duration = bundle.stream.duration ?? 10;
  const events: number[] = [];
  for (let i = 1; i <= DEFAULT_EVENT_COUNT; i++) {
    events.push((duration * i) / (DEFAULT_EVENT_COUNT + 1));
  }
  return {
    id: bundle.id,
    color: TRACK_COLOR_BY_KIND[bundle.kind],
    start: 0,
    end: duration,
    events,
  };
}

/** Map a list of bundles into tracks via {@link bundleToTrack}. */
export function tracksFromBundles(
  bundles: MockStreamBundle[]
): TimelineTrackConfig[] {
  return bundles.map(bundleToTrack);
}
