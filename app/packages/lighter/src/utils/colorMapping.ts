/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getLabelColor } from "@fiftyone/looker/src/overlays/util";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { COLOR_BY, getColor } from "@fiftyone/utilities";
import { SELECTED_DASH_LENGTH } from "../constants";
import type { BaseOverlay } from "../overlay/BaseOverlay";

// White for info (selection, here)
const INFO_COLOR = "#FFFFFF";
// White for hover effect as well
const HOVER_COLOR = "#FFFFFF";

export interface ColorMappingContext {
  colorScheme: ColorSchemeInput;
  seed: number;
}

export interface StrokeStyles {
  strokeColor: string;
  overlayStrokeColor: string | null;
  overlayDash: number | null;
  hoverStrokeColor: string | null;
}

/**
 * Resolve a color for a label under the given color-mapping context.
 *
 * Lightweight adapter around Looker's `getLabelColor`, with the same
 * assumption as {@link getOverlayColor}: label tags are not accounted for.
 *
 * Use this when you need to color a UI element by the same rules the
 * overlay would use but don't have a {@link BaseOverlay} instance.
 */
<<<<<<< HEAD
export function getOverlayColor(
  overlay: BaseOverlay,
=======
export function getLabelColorFromContext(
  path: string,
  label: unknown,
>>>>>>> main
  context: ColorMappingContext,
): string {
  // Convert ColorSchemeInput to Coloring interface
  const coloring = {
    by:
      (context.colorScheme.colorBy?.toLocaleLowerCase() as
        | COLOR_BY.FIELD
        | COLOR_BY.INSTANCE
        | COLOR_BY.VALUE) || COLOR_BY.FIELD,
    pool: context.colorScheme.colorPool,
    scale: [],
    seed: context.seed,
    defaultMaskTargets: undefined,
    defaultMaskTargetsColors: [
      ...(context.colorScheme.defaultMaskTargetsColors || []),
    ],
    maskTargets: {},
    points: context.colorScheme.multicolorKeypoints || false,
    targets: [],
  };

  // Handle case when label is null or undefined
  if (!label) {
    return getColor(context.colorScheme.colorPool, context.seed, path);
  }

  const typedLabel = label as Record<string, unknown>;

  // Sensible defaults for missing parameters (lean towards false or undefined)
  const isTagged = false;
  const labelTagColors = {
    fieldColor: context.colorScheme.labelTags?.fieldColor || undefined,
    valueColors: [...(context.colorScheme.labelTags?.valueColors || [])],
  };
  const customizeColorSetting = (context.colorScheme.fields || []).map(
    (field) => ({
      ...field,
      colorByAttribute: field.colorByAttribute || undefined,
      fieldColor: field.fieldColor || undefined,
      maskTargetsColors: field.maskTargetsColors
        ? [...field.maskTargetsColors]
        : undefined,
      valueColors: field.valueColors ? [...field.valueColors] : undefined,
    }),
  );
  const embeddedDocType = typedLabel["_cls"];
  const isPolyline3D =
    "points3d" in typedLabel &&
    Array.isArray(typedLabel["points3d"]) &&
    (typedLabel["points3d"] as unknown[]).length > 0;
  const isDetection3D =
    "location" in typedLabel &&
    Array.isArray(typedLabel["location"]) &&
    (typedLabel["location"] as unknown[]).length > 0 &&
    "dimensions" in typedLabel &&
    Array.isArray(typedLabel["dimensions"]) &&
    (typedLabel["dimensions"] as unknown[]).length > 0;
  const is3D = isPolyline3D || isDetection3D;

  return getLabelColor({
    coloring,
    path,
    label: typedLabel as any,
    isTagged,
    labelTagColors,
    customizeColorSetting,
    is3D,
    embeddedDocType,
  });
}

/**
 * Maps Lighter / Annotation overlay information to a color using FiftyOne's
 * color scheme system.
 *
 * Thin wrapper around {@link getLabelColorFromContext} that extracts the
 * field + label from an overlay instance.
 */
export function getOverlayColor(
  overlay: BaseOverlay,
  context: ColorMappingContext,
): string {
  return getLabelColorFromContext(overlay.field, overlay.label, context);
}

/**
 * Gets stroke styles for overlays with instances.
 * Four possible cases when label.instance is defined:
 * 1. Label is neither selected nor hovered: default color
 * 2. Label is hovered: white border overlay
 * 3. Label is selected: stroke with dash of white and default color
 * 4. Label is selected and hovered: stroke with dash of orange and default color
 */
export function getInstanceStrokeStyles({
  isSelected,
  strokeColor,
  isHovered,
  dashLength = 8,
}: {
  isSelected: boolean;
  strokeColor: string;
  isHovered: boolean;
  dashLength?: number;
}): StrokeStyles {
  const INFO_COLOR = "#ffffff";
  const SELECTED_AND_HOVERED_COLOR = "#ff6f61";

  // Main stroke color
  let finalStrokeColor = strokeColor;
  let overlayStrokeColor: string | null = null;
  let overlayDash: number | null = null;

  if (isHovered && !isSelected) {
    finalStrokeColor = INFO_COLOR;
  }

  if (isSelected && isHovered) {
    overlayStrokeColor = SELECTED_AND_HOVERED_COLOR;
    overlayDash = dashLength;
  } else if (isSelected) {
    overlayStrokeColor = INFO_COLOR;
    overlayDash = dashLength;
  }

  return {
    strokeColor: finalStrokeColor,
    overlayStrokeColor,
    overlayDash,
    hoverStrokeColor: null,
  };
}

/**
 * Gets stroke styles for overlays without instances.
 * Three states:
 * 1. Selected: overlay a dashed white stroke on top of the main stroke
 * 2. Hovered: add white border overlay
 * 3. Default: normal stroke
 */
export function getSimpleStrokeStyles({
  isSelected,
  strokeColor,
  isHovered,
  dashLength,
}: {
  isSelected: boolean;
  strokeColor: string;
  isHovered?: boolean;
  dashLength?: number;
}): StrokeStyles {
  let overlayStrokeColor: string | null = null;
  let overlayDash: number | null = null;
  let hoverStrokeColor: string | null = null;

  if (isSelected) {
    overlayStrokeColor = INFO_COLOR;
    overlayDash = dashLength || SELECTED_DASH_LENGTH;
  } else if (isHovered && dashLength) {
    overlayStrokeColor = HOVER_COLOR;
    overlayDash = dashLength;
  } else if (isHovered) {
    hoverStrokeColor = HOVER_COLOR;
  }

  return { strokeColor, overlayStrokeColor, overlayDash, hoverStrokeColor };
}
