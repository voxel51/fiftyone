import type { TimelineMode } from "@fiftyone/playback";
import type { StreamDescriptor } from "../../../ir";

// Placeholder metadata convention written by
// datasets/timing_mode_test/tools/rewrite-timing-mode.mjs — not a finalized
// ingestion contract. Keeping this compatibility at the episode presentation
// boundary prevents the format-neutral view from depending on the MCAP adapter.
const TIMELINE_MODE_METADATA_KEY = "mcap.channel_metadata.timeline_mode";
const TIMELINE_FPS_METADATA_KEY = "mcap.channel_metadata.timeline_fps";
const TIMELINE_EPOCH_ANCHOR_METADATA_KEY =
  "mcap.channel_metadata.timeline_epoch_anchor_ms";
const SCENE_START_TIME_NS_METADATA_KEY = "mcap.scene_start_time_ns";

/**
 * Resolves an episode's presentation mode from stream metadata. Looks at the
 * first stream carrying a `timeline_mode` key and falls back to `duration` if
 * a declared sequence or absolute mode cannot be converted safely.
 */
export function resolveTimelineMode(
  streams: readonly StreamDescriptor[],
): TimelineMode {
  const tagged = streams.find(
    (stream) => stream.metadata?.[TIMELINE_MODE_METADATA_KEY] !== undefined,
  );
  const metadata = tagged?.metadata;
  if (!metadata) return { kind: "duration" };

  switch (metadata[TIMELINE_MODE_METADATA_KEY]) {
    case "sequence": {
      const fps = Number(metadata[TIMELINE_FPS_METADATA_KEY]);
      return Number.isFinite(fps) && fps > 0
        ? { kind: "sequence", fps }
        : { kind: "duration" };
    }
    case "absolute": {
      const explicitAnchorMs = Number(
        metadata[TIMELINE_EPOCH_ANCHOR_METADATA_KEY],
      );
      if (Number.isFinite(explicitAnchorMs)) {
        return { kind: "absolute", epochAnchorMs: explicitAnchorMs };
      }
      // The engine's clock is 0-based from the episode's first record, so an
      // absolute presentation needs that record's real timestamp as its anchor.
      let sceneStartTimeNs: bigint;
      try {
        sceneStartTimeNs = BigInt(
          metadata[SCENE_START_TIME_NS_METADATA_KEY] ?? "0",
        );
      } catch {
        return { kind: "duration" };
      }
      return {
        kind: "absolute",
        epochAnchorMs: Number(sceneStartTimeNs / 1_000_000n),
      };
    }
    default:
      return { kind: "duration" };
  }
}
