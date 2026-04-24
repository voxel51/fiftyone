import { isNativeMediaType } from "@fiftyone/looker/src/util";
import * as fos from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import mime from "mime";
import type React from "react";

type SampleRendererSurface = "grid" | "modal";

export type SampleRendererSampleLike = {
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

/**
 * Declarative media matchers used to determine renderer compatibility.
 */
export type MatchMedia = {
  extensions?: string[];
  mimeTypes?: string[];
  mediaTypes?: string[];
};

/**
 * Normalized media attributes derived from a sample and selected media field.
 */
export type SampleRendererMediaContext = {
  field: string;
  path: string | null;
  url: string | null;
  extension: string | null;
  mimeType: string | null;
  mediaType: string | null;
  isNative: boolean;
};

/**
 * Context used to evaluate whether a sample renderer supports a sample.
 */
export type SampleRendererMatchContext<TSample = SampleRendererSampleLike> = {
  sample: TSample;
  media: SampleRendererMediaContext;
  surface: SampleRendererSurface;
};

/**
 * Full context passed to sample renderer components at render time.
 */
export type SampleRendererRenderContext<TSample = SampleRendererSampleLike> =
  SampleRendererMatchContext<TSample> & {
    dataset: fos.State.Dataset;
    schema: Schema;
  };

/**
 * Props shape received by sample renderer React components.
 */
export type SampleRendererProps = {
  ctx: SampleRendererRenderContext<SampleRendererSampleLike>;
};

/**
 * Grid-specific renderer behavior, including enablement and optional override.
 */
export type GridConfig = {
  enabled?: boolean;
  overrideComponent?: React.FunctionComponent<SampleRendererProps>;
};

/**
 * Configuration for registering and selecting a sample renderer.
 */
export type SampleRendererOptions<TSample = SampleRendererSampleLike> = {
  priority?: number;
  supports:
    | MatchMedia
    | ((ctx: SampleRendererMatchContext<TSample>) => boolean);
  grid?: GridConfig;
};

type SampleRendererRegistrationLike<TSample = SampleRendererSampleLike> = {
  name: string;
  component: React.FunctionComponent<SampleRendererProps>;
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

/**
 * Normalizes a match-media configuration for case-insensitive comparisons.
 */
export function normalizeMatchMedia(
  matchMedia: MatchMedia | undefined
): MatchMedia {
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

/**
 * Returns true when a match-media config includes at least one matcher.
 */
export function hasMatchMediaMatchers(matchMedia: MatchMedia | undefined) {
  const normalized = normalizeMatchMedia(matchMedia);

  return !!(
    normalized.extensions?.length ||
    normalized.mimeTypes?.length ||
    normalized.mediaTypes?.length
  );
}

/**
 * Checks whether a media context satisfies all provided match-media filters.
 */
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

/**
 * Extracts the normalized file extension from a path or URL.
 */
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

/**
 * Resolves the selected media path for a sample using standardized URL fields.
 */
export function getSelectedMediaPath<TSample extends SampleRendererSampleLike>(
  sample: TSample,
  selectedMediaField: string
) {
  const urls = sample.urls ? fos.getNormalizedUrls(sample.urls) : undefined;

  return (
    urls?.[selectedMediaField] ||
    urls?.filepath ||
    sample.sample.filepath ||
    null
  );
}

/**
 * Builds normalized media metadata used for sample renderer matching and render context.
 */
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

/**
 * Creates the full render context passed to sample renderer components.
 */
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

/**
 * Returns whether a sample renderer registration is explicitly enabled for grid.
 */
export function isSampleRendererGridEnabled(
  registration: SampleRendererRegistrationLike
) {
  return registration.sampleRendererOptions.grid?.enabled === true;
}

/**
 * Evaluates whether a renderer registration supports the provided match context.
 */
export function supportsSampleRenderer(
  registration: SampleRendererRegistrationLike<SampleRendererSampleLike>,
  ctx: SampleRendererMatchContext<SampleRendererSampleLike>
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

/**
 * Sorts renderer registrations by priority, then by name for deterministic ordering.
 */
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

/**
 * Returns the highest-priority renderer registration that supports the given context.
 */
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

/**
 * Selects the renderer component to use for the current surface.
 */
export function getSampleRendererComponent<TSample = unknown>(
  registration: SampleRendererRegistrationLike<TSample>,
  surface: SampleRendererSurface,
  canonicalComponent: React.FunctionComponent<SampleRendererProps>
) {
  if (surface === "grid") {
    return (
      registration.sampleRendererOptions.grid?.overrideComponent ||
      canonicalComponent
    );
  }

  return canonicalComponent;
}
