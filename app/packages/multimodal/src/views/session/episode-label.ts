import type { SampleRendererSampleLike } from "@fiftyone/plugins";

/** Compact identity for reference-backed episodes in shared grid/modal chrome. */
export function episodeDisplayName(
  sample: SampleRendererSampleLike["sample"] & {
    readonly duration?: unknown;
    readonly episode_index?: unknown;
    readonly task?: unknown;
  },
): string | null {
  const episodeIndex = finiteNumber(sample.episode_index);
  if (episodeIndex === null) return null;
  const parts = [`Episode ${Math.trunc(episodeIndex)}`];
  if (typeof sample.task === "string" && sample.task.trim()) {
    parts.push(sample.task.trim());
  }
  const duration = finiteNumber(sample.duration);
  if (duration !== null && duration >= 0) {
    parts.push(`${formatDuration(duration)}s`);
  }
  return parts.join(" · ");
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDuration(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, "");
}
