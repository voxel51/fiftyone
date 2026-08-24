import * as fos from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import type React from "react";

type SampleRendererSurface = "grid" | "modal";

export type MediaReferenceDescriptor = {
  readonly kind: string;
  readonly key: string;
  readonly version: string;
};

export type SampleRendererSampleLike = {
  frameNumber?: number | null;
  frameRate?: number | null;
  sample: {
    _id: string;
    filepath?: string | null;
    _media_reference?: MediaReferenceDescriptor | null;
    media_type?: string | null;
    _media_type?: string | null;
    metadata?: {
      width?: number;
      height?: number;
      mime_type?: string;
      size_bytes?: number;
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
  mediaReferenceKinds?: string[];
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
  mediaReference: MediaReferenceDescriptor | null;
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
    /**
     * The modal selected a new sample whose record is still resolving. A
     * persistent renderer may keep shell state mounted, but must not present
     * source-backed content from the retained sample.
     */
    transitioning?: boolean;
  };

/**
 * Props shape received by sample renderer React components.
 */
export type SampleRendererProps = {
  ctx: SampleRendererRenderContext<SampleRendererSampleLike>;
  /** Whether a grid renderer is both mounted and unobscured by the modal. */
  isGridActive?: boolean;
  /** Reports renderer-owned retained bytes to the grid's hidden-item LRU. */
  onRetainedBytesChange?: (retainedBytes: number) => void;
};

/**
 * Stable slots exposed by the grid surface for renderer-owned controls.
 */
export const SAMPLE_RENDERER_GRID_SLOT = {
  HEADER_AFTER_RESOURCE_COUNT: "grid-header-after-resource-count",
} as const;

export type SampleRendererGridSlot =
  (typeof SAMPLE_RENDERER_GRID_SLOT)[keyof typeof SAMPLE_RENDERER_GRID_SLOT];

/**
 * Controls how otherwise-unhandled grid-tile activation events are routed.
 *
 * - `"renderer"` (default) keeps click and context-menu events inside the
 *   sample renderer. Users open the sample modal with the grid's explicit
 *   open-modal control.
 * - `"passthrough"` allows those events to bubble to the host grid, where a
 *   normal tile click opens the sample modal. Renderer-owned interactive
 *   regions can still call `stopPropagation()` to retain their interactions.
 *
 * This option does not disable pointer events or affect hover behavior,
 * renderer-owned controls, the sample-selection checkbox, or the explicit
 * open-modal control.
 */
export type SampleRendererGridClickBehavior = "renderer" | "passthrough";

/**
 * Grid-specific renderer behavior, including enablement and optional override.
 */
export type GridConfig = {
  /**
   * Enables the sample renderer on the grid surface. Grid rendering is
   * disabled unless this is explicitly set to `true`.
   */
  enabled?: boolean;
  /**
   * Optional component used only on the grid surface. When omitted, the
   * renderer's canonical component is used in both the grid and modal.
   */
  overrideComponent?: React.FunctionComponent<SampleRendererProps>;
  /**
   * Controls whether otherwise-unhandled tile activation events stay within
   * the renderer or pass through to the host grid. Defaults to `"renderer"`.
   *
   * Use `"passthrough"` for non-interactive previews that should behave like
   * native grid tiles. A renderer that mixes interactive and non-interactive
   * regions may opt into passthrough and call `stopPropagation()` only from
   * the interactive regions.
   */
  clickBehavior?: SampleRendererGridClickBehavior;
  /**
   * Components rendered in named grid slots while this renderer is active.
   */
  slots?: Partial<Record<SampleRendererGridSlot, React.FunctionComponent>>;
};

/**
 * Modal-specific renderer behavior.
 */
export type ModalConfig = {
  /**
   * Keep the renderer shell mounted while navigating between samples it
   * supports. The renderer must derive all per-sample state from `ctx`
   * (or key its own internal subtrees).
   */
  persistAcrossSamples?: boolean;
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
  modal?: ModalConfig;
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
  normalizer: (value: string) => string | null,
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
  matchMedia: MatchMedia | undefined,
): MatchMedia {
  return {
    extensions: normalizeMatcherArray(
      matchMedia?.extensions,
      normalizeExtensionValue,
    ),
    mediaReferenceKinds: normalizeMatcherArray(
      matchMedia?.mediaReferenceKinds,
      normalizeMatcherValue,
    ),
    mimeTypes: normalizeMatcherArray(
      matchMedia?.mimeTypes,
      normalizeMatcherValue,
    ),
    mediaTypes: normalizeMatcherArray(
      matchMedia?.mediaTypes,
      normalizeMatcherValue,
    ),
  };
}

function matchesField(allowed: string[] | undefined, value: string | null) {
  return !allowed?.length || (Boolean(value) && allowed.includes(value));
}

/**
 * Returns true when a match-media config includes at least one matcher.
 */
export function hasMatchMediaMatchers(matchMedia: MatchMedia | undefined) {
  const normalized = normalizeMatchMedia(matchMedia);

  return !!(
    normalized.extensions?.length ||
    normalized.mediaReferenceKinds?.length ||
    normalized.mimeTypes?.length ||
    normalized.mediaTypes?.length
  );
}

/**
 * Checks whether a media context satisfies all provided match-media filters.
 */
export function matchesMatchMedia(
  matchMedia: MatchMedia | undefined,
  media: SampleRendererMediaContext,
) {
  const normalized = normalizeMatchMedia(matchMedia);

  if (!hasMatchMediaMatchers(matchMedia)) {
    return false;
  }

  return (
    matchesField(
      normalized.extensions,
      normalizeExtensionValue(media.extension),
    ) &&
    matchesField(
      normalized.mediaReferenceKinds,
      normalizeMatcherValue(media.mediaReference?.kind),
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
  selectedMediaField: string,
) {
  const urls = sample.urls ? fos.getNormalizedUrls(sample.urls) : undefined;

  return fos.resolveMediaFieldLooker({
    mediaField: selectedMediaField,
    sample: sample.sample,
    urls: urls ?? {},
  }).selectedMediaPath;
}

/**
 * Builds normalized media metadata used for sample renderer matching and render context.
 */
export function createSampleRendererMediaContext<
  TSample extends SampleRendererSampleLike,
>(sample: TSample, selectedMediaField: string): SampleRendererMediaContext {
  const urls = sample.urls ? fos.getNormalizedUrls(sample.urls) : undefined;
  const selectedMedia = fos.resolveMediaFieldLooker({
    mediaField: selectedMediaField,
    sample: sample.sample,
    urls: urls ?? {},
  });
  const path = selectedMedia.selectedMediaPath ?? null;
  const mediaType =
    sample.sample.media_type ?? sample.sample._media_type ?? null;
  const mediaReference = sample.sample._media_reference ?? null;

  return {
    field: selectedMediaField,
    path,
    url: path ? fos.getSampleSrc(path) : null,
    extension: getFileExtension(path),
    mimeType: selectedMedia.mimeType,
    mediaType,
    isNative: !mediaReference && selectedMedia.nativeLookerType !== null,
    mediaReference,
  };
}

/** Returns whether a renderer can receive a file URL or logical reference. */
export function hasSampleRendererSource(
  media: SampleRendererMediaContext,
): boolean {
  return Boolean(media.url || media.mediaReference);
}

/**
 * Creates the full render context passed to sample renderer components.
 */
export function createSampleRendererRenderContext<
  TSample extends SampleRendererSampleLike,
>(
  sample: TSample,
  selectedMediaField: string,
  dataset: fos.State.Dataset,
  schema: Schema,
  surface: SampleRendererSurface,
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
  registration: SampleRendererRegistrationLike,
) {
  return registration.sampleRendererOptions.grid?.enabled === true;
}

/**
 * Returns whether a renderer opts into persisting across sample navigation
 * in the modal.
 */
export function isSampleRendererModalPersistent(
  registration: SampleRendererRegistrationLike,
) {
  return (
    registration.sampleRendererOptions.modal?.persistAcrossSamples === true
  );
}

/**
 * Returns the configured grid slot component when grid rendering is enabled.
 */
export function getSampleRendererGridSlotComponent(
  registration: SampleRendererRegistrationLike,
  slot: SampleRendererGridSlot,
) {
  if (!isSampleRendererGridEnabled(registration)) {
    return null;
  }

  return registration.sampleRendererOptions.grid?.slots?.[slot] || null;
}

/**
 * Evaluates whether a renderer registration supports the provided match context.
 */
export function supportsSampleRenderer(
  registration: SampleRendererRegistrationLike<SampleRendererSampleLike>,
  ctx: SampleRendererMatchContext<SampleRendererSampleLike>,
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
        error,
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
  TRegistration extends SampleRendererRegistrationLike,
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
  TRegistration extends SampleRendererRegistrationLike,
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
  canonicalComponent: React.FunctionComponent<SampleRendererProps>,
) {
  if (surface === "grid") {
    return (
      registration.sampleRendererOptions.grid?.overrideComponent ||
      canonicalComponent
    );
  }

  return canonicalComponent;
}
