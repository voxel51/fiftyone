import type {
  McapPanelPlan,
  McapSceneOpenResponse,
  McapStreamDescriptor,
  McapTimeRange,
} from "./types";

type McapStreamCounts = {
  total: number;
  image: number;
  pointcloud: number;
};

type McapActivePanelState = {
  activePanelId: string | null;
  panel: McapPanelPlan | null;
  stream: McapStreamDescriptor | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatFallbackRole(role: McapStreamDescriptor["role"]) {
  return role.replace("_", " ");
}

/** Returns compact stream counts grouped by supported MCAP role. */
export function getMcapStreamCounts(
  streams: McapStreamDescriptor[]
): McapStreamCounts {
  return streams.reduce<McapStreamCounts>(
    (counts, stream) => {
      counts.total += 1;

      if (stream.role === "image_stream") {
        counts.image += 1;
      }

      if (stream.role === "pointcloud_stream") {
        counts.pointcloud += 1;
      }

      return counts;
    },
    { total: 0, image: 0, pointcloud: 0 }
  );
}

/** Formats an MCAP scene or stream duration from nanoseconds. */
export function formatMcapDuration(timeRange: McapTimeRange): string {
  const durationNs = Math.max(0, timeRange.endNs - timeRange.startNs);
  const durationMs = durationNs / 1_000_000;
  const durationSeconds = durationNs / 1_000_000_000;

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  if (durationSeconds < 60) {
    const seconds =
      durationSeconds >= 10 || Number.isInteger(durationSeconds)
        ? durationSeconds.toFixed(0)
        : durationSeconds.toFixed(1);
    return `${seconds} s`;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);

  if (durationSeconds < 3600) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

/** Formats an MCAP time range using raw nanosecond bounds. */
export function formatMcapTimeRange(timeRange: McapTimeRange): string {
  if (timeRange.startNs === timeRange.endNs) {
    return formatNumber(timeRange.startNs);
  }

  return `${formatNumber(timeRange.startNs)} - ${formatNumber(
    timeRange.endNs
  )}`;
}

/** Builds a compact label for a stream topic for grid cards and panel pills. */
export function getMcapStreamDisplayLabel(
  stream: Pick<McapStreamDescriptor, "topic" | "role">
): string {
  const segments = stream.topic.split("/").filter(Boolean);

  if (!segments.length) {
    return formatFallbackRole(stream.role);
  }

  if (segments.length <= 2) {
    return segments.join("/");
  }

  return segments.slice(-2).join("/");
}

/** Returns the first compact stream labels that should be surfaced in the UI. */
export function getMcapCompactStreamLabels(
  streams: McapStreamDescriptor[],
  maxCount = 2
): string[] {
  return streams.slice(0, maxCount).map((stream) => {
    return getMcapStreamDisplayLabel(stream);
  });
}

/** Resolves the active playback-plan panel and its matched stream descriptor. */
export function getMcapActivePanelState(
  data: McapSceneOpenResponse,
  activePanelId: string | null
): McapActivePanelState {
  const panels = data.playbackPlan.panels;
  const panel =
    panels.find((candidate) => candidate.panelId === activePanelId) ??
    panels[0] ??
    null;
  const stream =
    data.scene.streams.find((candidate) => {
      return candidate.streamId === panel?.streamId;
    }) ?? null;

  return {
    activePanelId: panel?.panelId ?? null,
    panel,
    stream,
  };
}
