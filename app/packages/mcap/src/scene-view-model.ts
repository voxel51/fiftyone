import {
  isImageRenderableStream,
  isRenderableStream,
  isScene3dRenderableStream,
} from "./panel-binding-registry";
import type {
  MultimodalCatalog,
  MultimodalStreamDescriptor,
  MultimodalTimeRange,
} from "./types";

type MultimodalStreamCounts = {
  total: number;
  image: number;
  threeD: number;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function getMultimodalStreamCounts(
  streams: MultimodalStreamDescriptor[]
): MultimodalStreamCounts {
  return streams.reduce<MultimodalStreamCounts>(
    (counts, stream) => {
      counts.total += 1;
      if (isImageRenderableStream(stream)) {
        counts.image += 1;
      }
      if (isScene3dRenderableStream(stream)) {
        counts.threeD += 1;
      }
      return counts;
    },
    { total: 0, image: 0, threeD: 0 }
  );
}

export function formatMultimodalDuration(
  timeRange: MultimodalTimeRange
): string {
  const durationNs = Math.max(0, timeRange.endNs - timeRange.startNs);
  const durationMs = durationNs / 1_000_000;
  const durationSeconds = durationNs / 1_000_000_000;

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  if (durationSeconds < 60) {
    return `${
      durationSeconds >= 10
        ? durationSeconds.toFixed(0)
        : durationSeconds.toFixed(1)
    } s`;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

export function getMultimodalStreamDisplayLabel(
  stream: Pick<MultimodalStreamDescriptor, "topic" | "kind">
): string {
  const segments = stream.topic.split("/").filter(Boolean);
  if (!segments.length) {
    return stream.kind;
  }
  return segments.length <= 2
    ? segments.join("/")
    : segments.slice(-2).join("/");
}

export function getMultimodalCompactStreamLabels(
  streams: MultimodalStreamDescriptor[],
  maxCount = 2
): string[] {
  return streams
    .filter((stream) => isRenderableStream(stream))
    .slice(0, maxCount)
    .map((stream) => getMultimodalStreamDisplayLabel(stream));
}

export function formatMultimodalTimeRange(
  timeRange: MultimodalTimeRange
): string {
  if (timeRange.startNs === timeRange.endNs) {
    return formatNumber(timeRange.startNs);
  }

  return `${formatNumber(timeRange.startNs)} - ${formatNumber(
    timeRange.endNs
  )}`;
}

export function getStreamById(
  catalog: MultimodalCatalog,
  streamId: string | null
) {
  if (!streamId) {
    return null;
  }

  return catalog.streams.find((stream) => stream.streamId === streamId) ?? null;
}
