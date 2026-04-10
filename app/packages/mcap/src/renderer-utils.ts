import type { SampleRendererRenderContext } from "@fiftyone/plugins";

type SampleRecord = Record<string, unknown>;

type McapRendererInfo = {
  basename: string;
  datasetName: string;
  mediaExtension: string;
  mediaField: string;
  mediaPath: string | null;
  mediaUrl: string | null;
  samplePath: string | null;
  surface: string;
};

function getSampleRecord(sampleLike: unknown): SampleRecord | null {
  if (!sampleLike || typeof sampleLike !== "object") {
    return null;
  }

  if (
    "sample" in sampleLike &&
    sampleLike.sample &&
    typeof sampleLike.sample === "object"
  ) {
    return sampleLike.sample as SampleRecord;
  }

  return sampleLike as SampleRecord;
}

function getStringValue(
  object: SampleRecord | null,
  key: string
): string | null {
  const value = object?.[key];
  return typeof value === "string" && value.length ? value : null;
}

function getBasename(path: string | null) {
  if (!path) {
    return "sample.mcap";
  }

  const normalizedPath = path.split(/[?#]/)[0];
  const segments = normalizedPath.split(/[/\\]/);
  return segments.at(-1) || normalizedPath;
}

function getMediaExtension(extension: string | null) {
  if (!extension) {
    return "unknown";
  }

  return extension.startsWith(".") ? extension.slice(1) : extension;
}

/** Builds stable display data for MCAP sample renderers. */
export function getMcapRendererInfo(
  ctx: SampleRendererRenderContext
): McapRendererInfo {
  const sampleRecord = getSampleRecord(ctx.sample);
  const samplePath = getStringValue(sampleRecord, "filepath");
  const mediaPath = ctx.media.path ?? samplePath;

  return {
    basename: getBasename(mediaPath),
    datasetName: ctx.dataset?.name ?? "dataset",
    mediaExtension: getMediaExtension(ctx.media.extension),
    mediaField: ctx.media.field,
    mediaPath,
    mediaUrl: ctx.media.url,
    samplePath,
    surface: ctx.surface,
  };
}
