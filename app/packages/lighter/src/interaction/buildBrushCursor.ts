/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Generates a CSS cursor data-URL for the segmentation brush/eraser tool.
 */

import type { SegmentationToolState } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";

/**
 * Returns a CSS `cursor` value (data-URL SVG + hotspot) for the given brush
 * configuration.  Falls back to `"crosshair"` when the computed size is too
 * small to render meaningfully.
 */
export function buildBrushCursor({
  tool,
  cursorSize,
  shape,
}: SegmentationToolState): string {
  if (tool === "select") return "default";

  const isEraser = tool === "eraser";
  const dashColor = isEraser ? "red" : "black";

  const half = cursorSize / 2;
  const pad = 2;
  const svgSize = cursorSize + pad * 2;
  const center = half + pad;

  let shapeMarkup: string;

  if (shape === "square") {
    shapeMarkup =
      `<rect x="${pad}" y="${pad}" width="${cursorSize}" height="${cursorSize}" fill="none" stroke="white" stroke-width="1.5"/>` +
      `<rect x="${pad}" y="${pad}" width="${cursorSize}" height="${cursorSize}" fill="none" stroke="${dashColor}" stroke-width="1.5" stroke-dasharray="3,3"/>`;
  } else {
    shapeMarkup =
      `<circle cx="${center}" cy="${center}" r="${half}" fill="none" stroke="white" stroke-width="1.5"/>` +
      `<circle cx="${center}" cy="${center}" r="${half}" fill="none" stroke="${dashColor}" stroke-width="1.5" stroke-dasharray="3,3"/>`;
  }

  let eraserMarkup = "";

  if (isEraser) {
    // Slash from bottom-left to top-right, edge to edge
    let x1: number, y1: number, x2: number, y2: number;
    if (shape === "square") {
      x1 = pad;
      y1 = pad + cursorSize;
      x2 = pad + cursorSize;
      y2 = pad;
    } else {
      const diag = half * Math.SQRT1_2;
      x1 = center - diag;
      y1 = center + diag;
      x2 = center + diag;
      y2 = center - diag;
    }
    eraserMarkup =
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="white" stroke-width="1.5" stroke-dasharray="3,3" stroke-dashoffset="3"/>` +
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="red" stroke-width="1.5" stroke-dasharray="3,3"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}">${shapeMarkup}${eraserMarkup}</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(
    svg
  )}") ${center} ${center}, crosshair`;
}
