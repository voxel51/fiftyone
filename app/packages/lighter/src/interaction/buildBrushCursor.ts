/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Generates a CSS cursor data-URL for the segmentation brush/eraser tool.
 */

import {
  MAX_TOOL_SIZE,
  MIN_TOOL_SIZE,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import type { SegmentationToolData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";

/**
 * Returns a CSS `cursor` value (data-URL SVG + hotspot) for the given brush
 * configuration.  Falls back to `"crosshair"` when the computed size is too
 * small to render meaningfully.
 */
export function buildBrushCursor(toolData: SegmentationToolData): string {
  if (toolData.tool === "select") return "default";

  const diameter = Math.round(
    Math.min(MAX_TOOL_SIZE, Math.max(MIN_TOOL_SIZE, toolData.size))
  );

  const half = diameter / 2;
  const pad = 2;
  const svgSize = diameter + pad * 2;
  const center = half + pad;

  let shapeMarkup: string;

  if (toolData.shape === "square") {
    shapeMarkup =
      `<rect x="${pad}" y="${pad}" width="${diameter}" height="${diameter}" fill="none" stroke="white" stroke-width="1.5"/>` +
      `<rect x="${pad}" y="${pad}" width="${diameter}" height="${diameter}" fill="none" stroke="black" stroke-width="1.5" stroke-dasharray="3,3"/>`;
  } else {
    shapeMarkup =
      `<circle cx="${center}" cy="${center}" r="${half}" fill="none" stroke="white" stroke-width="1.5"/>` +
      `<circle cx="${center}" cy="${center}" r="${half}" fill="none" stroke="black" stroke-width="1.5" stroke-dasharray="3,3"/>`;
  }

  let eraserMarkup = "";

  if (toolData.tool === "eraser") {
    const offset = half * 0.5;
    eraserMarkup =
      `<line x1="${center - offset}" y1="${center - offset}" x2="${
        center + offset
      }" y2="${
        center + offset
      }" stroke="white" stroke-width="2.5" stroke-linecap="round"/>` +
      `<line x1="${center - offset}" y1="${center - offset}" x2="${
        center + offset
      }" y2="${
        center + offset
      }" stroke="red" stroke-width="1.5" stroke-linecap="round"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}">${shapeMarkup}${eraserMarkup}</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(
    svg
  )}") ${center} ${center}, crosshair`;
}
