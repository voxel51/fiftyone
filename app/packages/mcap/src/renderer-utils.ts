import type { SampleRendererRenderContext } from "@fiftyone/plugins";
import type { FetchMcapSceneParams } from "./types";

type SampleRecord = Record<string, unknown>;

type McapRendererInfo = {
  basename: string;
  datasetId: string | null;
  datasetName: string;
  mediaExtension: string;
  mediaField: string;
  mediaPath: string | null;
  mediaUrl: string | null;
  sampleId: string | null;
  samplePath: string | null;
  surface: string;
};

function getRecord(value: unknown): SampleRecord | null {
  return value && typeof value === "object" ? (value as SampleRecord) : null;
}

function getSampleRecords(sampleLike: unknown) {
  const rootRecord = getRecord(sampleLike);
  const nestedSampleRecord = getRecord(rootRecord?.sample);

  return {
    nestedSampleRecord,
    rootRecord,
  };
}

function getFirstStringValue(
  records: Array<SampleRecord | null>,
  keys: string[]
): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "string" && value.length) {
        return value;
      }
    }
  }

  return null;
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
  const { nestedSampleRecord, rootRecord } = getSampleRecords(ctx.sample);
  const samplePath = getFirstStringValue(
    [nestedSampleRecord, rootRecord],
    ["filepath"]
  );
  const mediaPath = ctx.media.path ?? samplePath;

  return {
    basename: getBasename(mediaPath),
    datasetId: getFirstStringValue(
      [getRecord(ctx.dataset)],
      ["datasetId", "id"]
    ),
    datasetName: ctx.dataset?.name ?? "dataset",
    mediaExtension: getMediaExtension(ctx.media.extension),
    mediaField: ctx.media.field,
    mediaPath,
    mediaUrl: ctx.media.url,
    sampleId: getFirstStringValue(
      [nestedSampleRecord, rootRecord],
      ["_id", "id"]
    ),
    samplePath,
    surface: ctx.surface,
  };
}

/** Resolves the scene-open request parameters from a renderer context. */
export function getMcapSceneParams(
  ctx: SampleRendererRenderContext
): FetchMcapSceneParams {
  const info = getMcapRendererInfo(ctx);

  if (!info.datasetId) {
    throw new Error("MCAP renderer requires a dataset id");
  }

  if (!info.sampleId) {
    throw new Error("MCAP renderer requires a sample id");
  }

  if (!info.mediaField) {
    throw new Error("MCAP renderer requires a media field");
  }

  return {
    datasetId: info.datasetId,
    sampleId: info.sampleId,
    mediaField: info.mediaField,
  };
}
