import * as fos from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import mime from "mime";

type RenderClaimSurface = "grid" | "modal";
type PanelSurface = "grid" | "modal" | "grid modal";

type RenderClaimSampleLike = {
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

type NormalizedRenderClaims = {
  extensions?: string[];
  mimeTypes?: string[];
  mediaTypes?: string[];
  modeExtensions?: RenderClaimModeExtension[];
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

function isRenderClaimModeExtension(
  value: string | null
): value is RenderClaimModeExtension {
  return (
    value === RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE ||
    value === RENDER_CLAIM_MODE_EXTENSION_GRID
  );
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
    modeExtensions: normalizeModeExtensions(renderClaims?.modeExtensions),
  };
}

function matchesField(allowed: string[] | undefined, value: string | null) {
  return !allowed?.length || (Boolean(value) && allowed.includes(value));
}

function getSampleMimeType(
  sample: RenderClaimSampleLike["sample"],
  selectedMediaPath?: string | null
): string | null {
  if (selectedMediaPath && selectedMediaPath !== sample.filepath) {
    return mime.getType(selectedMediaPath) ?? null;
  }

  if (sample.metadata?.mime_type) {
    return sample.metadata.mime_type;
  }

  const mimeFromFilePath = mime.getType(sample.filepath);
  return mimeFromFilePath ?? null;
}

/** Render claims mode for modal annotate surface. */
export const RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE =
  "modal.annotate" as const;

/** Render claims mode for grid surface. */
export const RENDER_CLAIM_MODE_EXTENSION_GRID = "grid" as const;

/** Mode extension for render claims. */
export type RenderClaimModeExtension =
  | typeof RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE
  | typeof RENDER_CLAIM_MODE_EXTENSION_GRID;

/** Supported media matchers for a renderer plugin. */
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

/** Panel with optional render claims and configuration. */
export type RenderClaimPanelLike = {
  name: string;
  panelOptions?: {
    surfaces?: PanelSurface;
    priority?: number;
    renderClaims?: RenderClaims;
  };
};

/** Options for selecting a render-claim panel. */
export type RenderClaimSelectionOptions = {
  surface: RenderClaimSurface;
  isAnnotate?: boolean;
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

/** Extracts a lowercase file extension from a path or URL. */
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

/** Resolves selected media path from urls and falls back to `sample.filepath`. */
export function getSelectedMediaPath<TSample extends RenderClaimSampleLike>(
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

/** Builds render-claims context from sample-like data and app state. */
export function getRenderClaimsContext<TSample extends RenderClaimSampleLike>(
  sample: TSample,
  selectedMediaField: string,
  dataset: fos.State.Dataset,
  schema: Schema
): RenderClaimsContext<TSample> {
  const selectedMediaPath = getSelectedMediaPath(sample, selectedMediaField);

  return {
    sample,
    selectedMediaField,
    selectedMediaPath,
    selectedMediaUrl: selectedMediaPath
      ? fos.getSampleSrc(selectedMediaPath)
      : null,
    extension: getFileExtension(selectedMediaPath),
    mimeType: getSampleMimeType(sample.sample, selectedMediaPath),
    mediaType: sample.sample.media_type ?? sample.sample._media_type ?? null,
    dataset,
    schema,
  };
}

/** Sorts matching render-claim panels by priority desc, then name asc. */
export function sortRenderClaimPanelsByPriority<
  TPanel extends RenderClaimPanelLike
>(panelA: TPanel, panelB: TPanel) {
  const panelAPriority = panelA?.panelOptions?.priority || 0;
  const panelBPriority = panelB?.panelOptions?.priority || 0;

  if (panelAPriority !== panelBPriority) {
    return panelBPriority - panelAPriority;
  }

  return panelA.name.localeCompare(panelB.name);
}

/** Returns the highest-priority render-claim panel matching the given context and surface. */
export function getMatchingRenderClaimsPanel<
  TPanel extends RenderClaimPanelLike
>(
  panels: TPanel[],
  ctx: RenderClaimsMatchContext,
  options: RenderClaimSelectionOptions
) {
  return (
    panels
      .filter((panel) => {
        const renderClaims = panel.panelOptions?.renderClaims;
        if (!renderClaims) {
          return false;
        }

        if (
          options.surface === "grid" &&
          !hasRenderClaimModeExtension(
            renderClaims,
            RENDER_CLAIM_MODE_EXTENSION_GRID
          )
        ) {
          return false;
        }

        if (
          options.surface === "modal" &&
          options.isAnnotate &&
          !hasRenderClaimModeExtension(
            renderClaims,
            RENDER_CLAIM_MODE_EXTENSION_MODAL_ANNOTATE
          )
        ) {
          return false;
        }

        return matchesRenderClaims(renderClaims, ctx);
      })
      .sort(sortRenderClaimPanelsByPriority)
      .at(0) || null
  );
}

/** Returns `true` if claims include at least one non-empty matcher. */
export function hasRenderClaimMatchers(renderClaims: RenderClaims | undefined) {
  const normalized = normalizeRenderClaims(renderClaims);
  return !!(
    normalized.extensions?.length ||
    normalized.mimeTypes?.length ||
    normalized.mediaTypes?.length
  );
}

/** Returns unsupported `modeExtensions` values supplied in claims. */
export function getUnsupportedRenderClaimModeExtensions(
  renderClaims: RenderClaims | undefined
) {
  const modeExtensions = renderClaims?.modeExtensions;

  if (!modeExtensions) {
    return [];
  }

  if (!Array.isArray(modeExtensions)) {
    throw new TypeError(
      `Expected modeExtensions to be an array, got ${typeof modeExtensions}`
    );
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
