import { isImageRenderableStream } from "./panel-binding-registry";
import type { MultimodalCatalog, MultimodalTimeRange } from "./types";

const PREVIEWABLE_COMPRESSED_IMAGE_SCHEMA_NAMES = new Set([
  "sensor_msgs/msg/CompressedImage",
  "foxglove.CompressedImage",
]);

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

/** Formats a multimodal scene duration into a compact grid-friendly label. */
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

/** Formats a byte size into a compact grid-friendly file-size label. */
export function formatMultimodalFileSize(bytes: number | null | undefined) {
  if (!Number.isFinite(bytes) || bytes === null || bytes === undefined) {
    return "Unknown";
  }

  const absoluteBytes = Math.max(0, bytes);
  if (absoluteBytes < 1024) {
    return `${formatNumber(absoluteBytes)} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = absoluteBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formattedValue =
    value >= 100
      ? value.toFixed(0)
      : value >= 10
      ? value.toFixed(1)
      : value.toFixed(2);

  return `${formattedValue.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1")} ${
    units[unitIndex]
  }`;
}

function isPreviewableCompressedImageStream(
  stream: Pick<
    MultimodalCatalog["streams"][number],
    "compatiblePanels" | "kind" | "schemaName"
  >
) {
  return (
    isImageRenderableStream(stream) &&
    PREVIEWABLE_COMPRESSED_IMAGE_SCHEMA_NAMES.has(stream.schemaName)
  );
}

/** Returns the first grid-hover previewable compressed-image stream, if any. */
export function getMultimodalGridPreviewStream(
  catalog: Pick<MultimodalCatalog, "streams"> | null | undefined
) {
  return (
    catalog?.streams.find((stream) =>
      isPreviewableCompressedImageStream(stream)
    ) ?? null
  );
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
