/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { ColorSchemeInput } from "@fiftyone/relay";
import { getColor } from "@fiftyone/utilities";
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
 * Maps overlay information to a color using FiftyOne's color scheme system.
 * This replicates the logic from looker's getLabelColor function.
 */
export function getOverlayColor(
  overlay: BaseOverlay,
  context: ColorMappingContext
): string {
  const { colorScheme, seed } = context;
  const { colorPool, colorBy, fields, labelTags } = colorScheme;

  const path = overlay.field || "";
  const label = overlay.label;
  const isTagged = label?.tags && label.tags.length > 0;

  if (colorBy === "instance") {
    // Color by instance - use the overlay ID or label ID
    const identifier = label?.id || overlay.id;
    return getColor(colorPool, seed, identifier);
  }

  if (colorBy === "field") {
    if (isTagged) {
      // If tagged, use label tags color rules
      if (labelTags?.fieldColor) {
        return labelTags.fieldColor;
      }
      return getColor(colorPool, seed, "_label_tags");
    } else {
      // Use field-specific color if available
      const field = fields?.find((f) => f.path === path);
      if (field?.fieldColor) {
        return field.fieldColor;
      }
      return getColor(colorPool, seed, path);
    }
  }

  if (colorBy === "value") {
    // Color by value
    if (isTagged) {
      // If tagged, use tag-specific colors
      const tagColor = labelTags?.valueColors?.find((pair) =>
        label.tags.includes(pair.value)
      )?.color;

      if (tagColor) {
        return tagColor;
      }

      // Fallback to field color or default
      if (labelTags?.fieldColor) {
        return labelTags.fieldColor;
      }
      return getColor(colorPool, seed, "_label_tags");
    } else {
      // Use value-specific colors if available
      const field = fields?.find((f) => f.path === path);

      if (field?.valueColors && label) {
        const valueColor = field.valueColors.find((vc) => {
          const labelValue = label["label"];
          return vc.value === labelValue?.toString();
        })?.color;

        if (valueColor) {
          return valueColor;
        }
      }

      // Fallback to field color or default
      if (field?.fieldColor) {
        return field.fieldColor;
      }

      const identifier = label?.["label"] || path;
      return getColor(colorPool, seed, identifier);
    }
  }

  // Default fallback
  return getColor(colorPool, seed, path);
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
