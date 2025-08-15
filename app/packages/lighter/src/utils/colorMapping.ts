/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { ColorSchemeInput } from "@fiftyone/relay";
import { getColor } from "@fiftyone/utilities";
import type { BaseOverlay } from "../overlay/BaseOverlay";

export interface ColorMappingContext {
  colorScheme: ColorSchemeInput;
  seed: number;
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
