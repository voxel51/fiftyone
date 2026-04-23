import type { SampleRendererRenderContext } from "@fiftyone/plugins";
import { withInferredSourceKind } from "./source-registry";
import type { FetchMultimodalWorkspaceParams } from "./types";

type SampleRecord = Record<string, unknown>;

type MultimodalRendererInfo = {
  basename: string;
  datasetId: string | null;
  datasetName: string;
  fileSizeBytes: number | null;
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

function getFirstNumberValue(
  records: Array<SampleRecord | null>,
  keys: string[]
) {
  for (const record of records) {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function getBasename(path: string | null) {
  if (!path) {
    return "sample.multimodal";
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

/** Builds stable display data for Multimodal sample renderers. */
export function getMultimodalRendererInfo(
  ctx: SampleRendererRenderContext
): MultimodalRendererInfo {
  const { nestedSampleRecord, rootRecord } = getSampleRecords(ctx.sample);
  const metadataRecords = [
    getRecord(nestedSampleRecord?.metadata),
    getRecord(rootRecord?.metadata),
  ];
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
    fileSizeBytes: getFirstNumberValue(
      [nestedSampleRecord, rootRecord, ...metadataRecords],
      ["size_bytes", "sizeBytes"]
    ),
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
export function getMultimodalSceneParams(
  ctx: SampleRendererRenderContext
): FetchMultimodalWorkspaceParams {
  const info = getMultimodalRendererInfo(ctx);

  if (!info.datasetId) {
    throw new Error("multimodal renderer requires a dataset id");
  }

  if (!info.sampleId) {
    throw new Error("multimodal renderer requires a sample id");
  }

  if (!info.mediaField) {
    throw new Error("multimodal renderer requires a media field");
  }

  return withInferredSourceKind(
    {
      datasetId: info.datasetId,
      sampleId: info.sampleId,
      mediaField: info.mediaField,
    },
    info.mediaExtension,
    info.mediaPath
  );
}
