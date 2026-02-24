import * as fos from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";

/** Declarative file-matching rules for a panel that overrides modal rendering. */
export type ModalFileRenderer = {
  /**
   * File extensions supported by the panel renderer.
   * Values are normalized case-insensitively and may include or omit leading dots.
   */
  extensions?: string[];

  /**
   * MIME types supported by the panel renderer.
   * Values are normalized case-insensitively.
   */
  mimeTypes?: string[];

  /**
   * Media types supported by the panel renderer.
   * Values are normalized case-insensitively.
   */
  mediaTypes?: string[];

  /**
   * Whether this renderer can be used in annotate mode for non-native media.
   *
   * Defaults to `false`.
   */
  allowInAnnotateMode?: boolean;
};

type NormalizedModalFileRenderer = {
  extensions?: string[];
  mimeTypes?: string[];
  mediaTypes?: string[];
};

/** Lightweight context used to test whether a renderer matches the current media. */
export type ModalFileRendererMatchContext = {
  extension?: string | null;
  mimeType?: string | null;
  mediaType?: string | null;
};

/** Full context passed to a modal file renderer, including sample and dataset info. */
export type ModalFileRendererContext = ModalFileRendererMatchContext & {
  sample: fos.ModalSample;
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

function normalizeModalFileRenderer(
  modalFileRenderer: ModalFileRenderer | undefined
): NormalizedModalFileRenderer {
  return {
    extensions: normalizeMatcherArray(
      modalFileRenderer?.extensions,
      normalizeExtensionValue
    ),
    mimeTypes: normalizeMatcherArray(
      modalFileRenderer?.mimeTypes,
      normalizeMatcherValue
    ),
    mediaTypes: normalizeMatcherArray(
      modalFileRenderer?.mediaTypes,
      normalizeMatcherValue
    ),
  };
}

function matchesField(allowed: string[] | undefined, value: string | null) {
  return !allowed?.length || (!!value && allowed.includes(value));
}

/** Returns `true` if the renderer declares at least one non-empty matcher. */
export function hasModalFileRendererMatchers(
  modalFileRenderer: ModalFileRenderer | undefined
) {
  const normalized = normalizeModalFileRenderer(modalFileRenderer);
  return Boolean(
    normalized.extensions?.length ||
      normalized.mimeTypes?.length ||
      normalized.mediaTypes?.length
  );
}

/** Returns `true` if the renderer's matchers all match the given context (conjunction). */
export function matchesModalFileRenderer(
  modalFileRenderer: ModalFileRenderer | undefined,
  ctx: ModalFileRendererMatchContext
) {
  const normalized = normalizeModalFileRenderer(modalFileRenderer);

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
