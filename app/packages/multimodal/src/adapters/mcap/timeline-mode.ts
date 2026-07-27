import type { TimelineMode } from "@fiftyone/playback";
import type { StreamInventory } from "../../schemas/v1";

// Placeholder metadata convention written by
// datasets/timing_mode_test/tools/rewrite-timing-mode.mjs — not a finalized
// ingestion contract (see "Open concern: sequence mode's fps vs. the
// ingestion schema" in /home/mikeobrien/Voxel51/plans/TIMELINE_MODES_DESIGN.md).
// Rename/restructure freely once a real ingestion bridge design lands.
const TIMELINE_MODE_METADATA_KEY = "mcap.channel_metadata.timeline_mode";
const TIMELINE_FPS_METADATA_KEY = "mcap.channel_metadata.timeline_fps";
const TIMELINE_EPOCH_ANCHOR_METADATA_KEY =
  "mcap.channel_metadata.timeline_epoch_anchor_ms";
const SCENE_START_TIME_NS_METADATA_KEY = "mcap.scene_start_time_ns";

/**
 * Resolves a scene's `TimelineMode` from topic metadata. Looks at the first
 * topic carrying a `timeline_mode` key; falls back to `duration` if no topic
 * declares one, or if a declared `sequence`/`absolute` mode is missing the
 * data it needs to convert.
 */
export function resolveMcapTimelineMode(
  topics: readonly StreamInventory[],
): TimelineMode {
  const tagged = topics.find(
    (topic) => topic.metadata[TIMELINE_MODE_METADATA_KEY] !== undefined,
  );
  if (!tagged) return { kind: "duration" };

  switch (tagged.metadata[TIMELINE_MODE_METADATA_KEY]) {
    case "sequence": {
      const fps = Number(tagged.metadata[TIMELINE_FPS_METADATA_KEY]);
      return Number.isFinite(fps) && fps > 0
        ? { kind: "sequence", fps }
        : { kind: "duration" };
    }
    case "absolute": {
      const explicitAnchorMs = Number(
        tagged.metadata[TIMELINE_EPOCH_ANCHOR_METADATA_KEY],
      );
      if (Number.isFinite(explicitAnchorMs)) {
        return { kind: "absolute", epochAnchorMs: explicitAnchorMs };
      }
      // No explicit anchor override — the engine's internal clock is
      // 0-based from the scene's first message, so the anchor is that
      // message's real time.
      let sceneStartTimeNs: bigint;
      try {
        sceneStartTimeNs = BigInt(
          tagged.metadata[SCENE_START_TIME_NS_METADATA_KEY] ?? "0",
        );
      } catch {
        // Malformed metadata (e.g. non-integer) — fall back to duration
        // rather than crashing playback.
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
