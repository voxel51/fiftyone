import * as fos from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";

export const RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE =
  "modal.annotate" as const;

export type RenderClaimModeExtension =
  typeof RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE;

export type RenderClaims = {
  /**
   * File extensions supported by the renderer.
   * Values are normalized case-insensitively and may include or omit leading dots.
   */
  extensions?: string[];

  /**
   * MIME types supported by the renderer.
   * Values are normalized case-insensitively.
   */
  mimeTypes?: string[];

  /**
   * Media types supported by the renderer.
   * Values are normalized case-insensitively.
   */
  mediaTypes?: string[];

  /**
   * Optional runtime mode extensions that enable additional claim behavior.
   */
  modeExtensions?: RenderClaimModeExtension[];
};

type NormalizedRenderClaims = {
  extensions?: string[];
  mimeTypes?: string[];
  mediaTypes?: string[];
  modeExtensions?: RenderClaimModeExtension[];
};

/** Lightweight context used to test whether renderer claims match the current media. */
export type RenderClaimsMatchContext = {
  extension?: string | null;
  mimeType?: string | null;
  mediaType?: string | null;
};

/** Full context passed to a claim-based renderer, including sample and dataset info. */
export type RenderClaimsContext<TSample = unknown> =
  RenderClaimsMatchContext & {
    sample: TSample;
    selectedMediaField: string;
    selectedMediaPath: string | null;
    selectedMediaUrl: string | null;
    dataset: fos.State.Dataset;
    schema: Schema;
  };

function normalizeMatcherValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
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

function isRenderClaimModeExtension(
  value: string | null
): value is RenderClaimModeExtension {
  return value === RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE;
}

function normalizeModeExtensions(modeExtensions: unknown) {
  if (!Array.isArray(modeExtensions)) {
    return undefined;
  }

  const normalizedModeExtensions = modeExtensions
    .map((value) => normalizeMatcherValue(String(value ?? "")))
    .filter(isRenderClaimModeExtension);

  if (!normalizedModeExtensions.length) {
    return undefined;
  }

  return Array.from(new Set(normalizedModeExtensions));
}

function normalizeRenderClaims(
  renderClaims: RenderClaims | undefined
): NormalizedRenderClaims {
  return {
    extensions: normalizeMatcherArray(
      renderClaims?.extensions,
      normalizeExtensionValue
    ),
    mimeTypes: normalizeMatcherArray(
      renderClaims?.mimeTypes,
      normalizeMatcherValue
    ),
    mediaTypes: normalizeMatcherArray(
      renderClaims?.mediaTypes,
      normalizeMatcherValue
    ),
    modeExtensions: normalizeModeExtensions(
      (renderClaims as { modeExtensions?: unknown })?.modeExtensions
    ),
  };
}

function matchesField(allowed: string[] | undefined, value: string | null) {
  return !allowed?.length || (!!value && allowed.includes(value));
}

/** Returns `true` if claims include at least one non-empty matcher. */
export function hasRenderClaimMatchers(renderClaims: RenderClaims | undefined) {
  const normalized = normalizeRenderClaims(renderClaims);
  return Boolean(
    normalized.extensions?.length ||
      normalized.mimeTypes?.length ||
      normalized.mediaTypes?.length
  );
}

/** Returns unsupported `modeExtensions` values supplied in claims. */
export function getUnsupportedRenderClaimModeExtensions(
  renderClaims: RenderClaims | undefined
) {
  const modeExtensions = (renderClaims as { modeExtensions?: unknown })
    ?.modeExtensions;

  if (modeExtensions === undefined || modeExtensions === null) {
    return [];
  }

  if (!Array.isArray(modeExtensions)) {
    return ["<non-array>"];
  }

  const unsupported = modeExtensions
    .map((value) => normalizeMatcherValue(String(value ?? "")))
    .filter((value): value is string => Boolean(value))
    .filter((value) => !isRenderClaimModeExtension(value));

  return Array.from(new Set(unsupported));
}

/** Returns `true` when claims include the given mode extension. */
export function hasRenderClaimModeExtension(
  renderClaims: RenderClaims | undefined,
  modeExtension: RenderClaimModeExtension
) {
  const normalized = normalizeRenderClaims(renderClaims);
  return normalized.modeExtensions?.includes(modeExtension) ?? false;
}

/** Returns `true` if the claim matchers all match the given context (conjunction). */
export function matchesRenderClaims(
  renderClaims: RenderClaims | undefined,
  ctx: RenderClaimsMatchContext
) {
  const normalized = normalizeRenderClaims(renderClaims);

  if (
    !normalized.extensions?.length &&
    !normalized.mimeTypes?.length &&
    !normalized.mediaTypes?.length
  ) {
    return false;
  }

  return (
    matchesField(
      normalized.extensions,
      normalizeExtensionValue(ctx.extension)
    ) &&
    matchesField(normalized.mimeTypes, normalizeMatcherValue(ctx.mimeType)) &&
    matchesField(normalized.mediaTypes, normalizeMatcherValue(ctx.mediaType))
  );
}
