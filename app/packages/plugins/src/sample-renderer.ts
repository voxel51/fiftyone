import { isNativeMediaType } from "@fiftyone/looker/src/util";
import * as fos from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import mime from "mime";
import type React from "react";

type SampleRendererSurface = "grid" | "modal";

type SampleRendererSampleLike = {
  sample: {
    filepath: string;
    media_type?: string | null;
    _media_type?: string | null;
    metadata?: {
      width?: number;
      height?: number;
      mime_type?: string;
    };
  };
  urls?:
    | { [field: string]: string }
    | readonly { readonly field: string; readonly url: string | null }[];
};

type NormalizedMatchMedia = {
  extensions?: string[];
  mimeTypes?: string[];
  mediaTypes?: string[];
};

export type MatchMedia = {
  extensions?: string[];
  mimeTypes?: string[];
  mediaTypes?: string[];
};

export type SampleRendererMediaContext = {
  field: string;
  path: string | null;
  url: string | null;
  extension: string | null;
  mimeType: string | null;
  mediaType: string | null;
  isNative: boolean;
};

export type SampleRendererMatchContext<TSample = unknown> = {
  sample: TSample;
  media: SampleRendererMediaContext;
  surface: SampleRendererSurface;
};

export type SampleRendererRenderContext<TSample = unknown> =
  SampleRendererMatchContext<TSample> & {
    dataset: fos.State.Dataset;
    schema: Schema;
  };

export type SampleRendererProps<TSample = unknown> = {
  ctx: SampleRendererRenderContext<TSample>;
};

export type GridConfig<TSample = unknown> = {
  enabled?: boolean;
  overrideComponent?: React.FunctionComponent<SampleRendererProps<TSample>>;
};

export type SampleRendererOptions<TSample = unknown> = {
  priority?: number;
  supports:
    | MatchMedia
    | ((ctx: SampleRendererMatchContext<TSample>) => boolean);
  grid?: GridConfig<TSample>;
};

type SampleRendererRegistrationLike<TSample = unknown> = {
  name: string;
  component: React.FunctionComponent<SampleRendererProps<TSample>>;
  sampleRendererOptions: SampleRendererOptions<TSample>;
};

function normalizeMatcherValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function getPathname(path: string) {
  try {
    return new URL(path).pathname;
  } catch {
    return path;
  }
}

function normalizeExtensionValue(value: string | null | undefined) {
  const normalized = normalizeMatcherValue(value);

  if (!normalized) {
    return null;
  }

  return normalized.startsWith(".") ? normalized.slice(1) : normalized;
}

function normalizeMatcherArray(
  values: string[] | undefined,
  normalizer: (value: string) => string | null
) {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const normalizedValues = values
    .map((value) => normalizer(value))
    .filter((value): value is string => Boolean(value));

  if (!normalizedValues.length) {
    return undefined;
  }

  return Array.from(new Set(normalizedValues));
}

export function normalizeMatchMedia(
  matchMedia: MatchMedia | undefined
): NormalizedMatchMedia {
  return {
    extensions: normalizeMatcherArray(
      matchMedia?.extensions,
      normalizeExtensionValue
    ),
    mimeTypes: normalizeMatcherArray(
      matchMedia?.mimeTypes,
      normalizeMatcherValue
    ),
    mediaTypes: normalizeMatcherArray(
      matchMedia?.mediaTypes,
      normalizeMatcherValue
    ),
  };
}

function matchesField(allowed: string[] | undefined, value: string | null) {
  return !allowed?.length || (Boolean(value) && allowed.includes(value));
}

function getSampleMimeType(
  sample: SampleRendererSampleLike["sample"],
  selectedMediaPath?: string | null
) {
  if (selectedMediaPath && selectedMediaPath !== sample.filepath) {
    const mimeFromSelectedPath = mime.getType(selectedMediaPath);

    if (mimeFromSelectedPath) {
      return mimeFromSelectedPath;
    }
  }

  if (sample.metadata?.mime_type) {
    return sample.metadata.mime_type;
  }

  const mimeFromFilePath = mime.getType(sample.filepath);
  return mimeFromFilePath ?? null;
}

function isMatchMediaObject(
  supports:
    | MatchMedia
    | ((ctx: SampleRendererMatchContext<unknown>) => boolean)
    | undefined
): supports is MatchMedia {
  return Boolean(supports) && typeof supports !== "function";
}

export function hasMatchMediaMatchers(matchMedia: MatchMedia | undefined) {
  const normalized = normalizeMatchMedia(matchMedia);

  return !!(
    normalized.extensions?.length ||
    normalized.mimeTypes?.length ||
    normalized.mediaTypes?.length
  );
}

export function matchesMatchMedia(
  matchMedia: MatchMedia | undefined,
  media: SampleRendererMediaContext
) {
  const normalized = normalizeMatchMedia(matchMedia);

  if (!hasMatchMediaMatchers(matchMedia)) {
    return false;
  }

  return (
    matchesField(
      normalized.extensions,
      normalizeExtensionValue(media.extension)
    ) &&
    matchesField(normalized.mimeTypes, normalizeMatcherValue(media.mimeType)) &&
    matchesField(normalized.mediaTypes, normalizeMatcherValue(media.mediaType))
  );
}

export function getFileExtension(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const pathname = getPathname(path).split(/[?#]/)[0];
  const fileName = pathname.split(/[/\\]/).pop() || "";
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function getSelectedMediaPath<TSample extends SampleRendererSampleLike>(
  sample: TSample,
  selectedMediaField: string
) {
  const urls = sample.urls ? fos.getStandardizedUrls(sample.urls) : undefined;

  return (
    urls?.[selectedMediaField] ||
    urls?.filepath ||
    sample.sample.filepath ||
    null
  );
}

export function createSampleRendererMediaContext<
  TSample extends SampleRendererSampleLike
>(sample: TSample, selectedMediaField: string): SampleRendererMediaContext {
  const path = getSelectedMediaPath(sample, selectedMediaField);
  const mediaType =
    sample.sample.media_type ?? sample.sample._media_type ?? null;

  return {
    field: selectedMediaField,
    path,
    url: path ? fos.getSampleSrc(path) : null,
    extension: getFileExtension(path),
    mimeType: getSampleMimeType(sample.sample, path),
    mediaType,
    isNative: isNativeMediaType(mediaType ?? "unknown"),
  };
}

export function createSampleRendererRenderContext<
  TSample extends SampleRendererSampleLike
>(
  sample: TSample,
  selectedMediaField: string,
  dataset: fos.State.Dataset,
  schema: Schema,
  surface: SampleRendererSurface
): SampleRendererRenderContext<TSample> {
  return {
    sample,
    media: createSampleRendererMediaContext(sample, selectedMediaField),
    dataset,
    schema,
    surface,
  };
}

export function isSampleRendererGridEnabled(
  registration: SampleRendererRegistrationLike
) {
  return registration.sampleRendererOptions.grid?.enabled === true;
}

export function supportsSampleRenderer<TSample = unknown>(
  registration: SampleRendererRegistrationLike<TSample>,
  ctx: SampleRendererMatchContext<TSample>
) {
  if (ctx.media.isNative) {
    return false;
  }

  if (ctx.surface === "grid" && !isSampleRendererGridEnabled(registration)) {
    return false;
  }

  const { supports } = registration.sampleRendererOptions;

  if (typeof supports === "function") {
    try {
      return supports(ctx);
    } catch (error) {
      console.error(
        `Sample renderer "${registration.name}" failed while evaluating supports`,
        error
      );
      return false;
    }
  }

  return matchesMatchMedia(supports, ctx.media);
}

export function sortSampleRenderersByPriority<
  TRegistration extends SampleRendererRegistrationLike
>(registrationA: TRegistration, registrationB: TRegistration) {
  const priorityA = registrationA.sampleRendererOptions.priority || 0;
  const priorityB = registrationB.sampleRendererOptions.priority || 0;

  if (priorityA !== priorityB) {
    return priorityB - priorityA;
  }

  return registrationA.name.localeCompare(registrationB.name);
}

export function getMatchingSampleRenderer<
  TRegistration extends SampleRendererRegistrationLike
>(registrations: TRegistration[], ctx: SampleRendererMatchContext) {
  return (
    registrations
      .filter((registration) => supportsSampleRenderer(registration, ctx))
      .sort(sortSampleRenderersByPriority)
      .at(0) || null
  );
}

export function getSampleRendererComponent<TSample = unknown>(
  registration: SampleRendererRegistrationLike<TSample>,
  surface: SampleRendererSurface,
  canonicalComponent: React.FunctionComponent<SampleRendererProps<TSample>>
) {
  if (surface === "grid") {
    return (
      registration.sampleRendererOptions.grid?.overrideComponent ||
      canonicalComponent
    );
  }

  return canonicalComponent;
}
