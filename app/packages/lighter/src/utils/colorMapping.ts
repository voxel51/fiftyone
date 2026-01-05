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
 * Maps Lighter / Annotation overlay information to a color using FiftyOne's color scheme system.
 *
 * This is a lightweight adapter around Looker's getLabelColor function, while making some key assumptions:
 * 1. Label tags are not accounted for.
 */
export function getOverlayColor(
  overlay: BaseOverlay,
  context: ColorMappingContext
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

  // Map overlay properties to getLabelColor parameters
  const path = overlay.field;
  const label = overlay.label as any;

  // Handle case when overlay.label is null or undefined
  if (!label) {
    // Return a default color when no label is available
    return getColor(context.colorScheme.colorPool, context.seed, path);
  }

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
    })
  );
  const embeddedDocType = label["_cls"];
  const isPolyline3D =
    "points3d" in label &&
    Array.isArray(label["points3d"]) &&
    label["points3d"].length > 0;
  const isDetection3D =
    "location" in label &&
    Array.isArray(label["location"]) &&
    label["location"].length > 0 &&
    "dimensions" in label &&
    Array.isArray(label["dimensions"]) &&
    label["dimensions"].length > 0;
  const is3D = isPolyline3D || isDetection3D;

  return getLabelColor({
    coloring,
    path,
    label,
    isTagged,
    labelTagColors,
    customizeColorSetting,
    is3D,
    embeddedDocType,
  });
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
