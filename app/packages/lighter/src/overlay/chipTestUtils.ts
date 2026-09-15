/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { vi } from "vitest";
import type { DrawStyle, RenderMeta } from "../types";
import type { BaseOverlay } from "./BaseOverlay";

export const STYLE: DrawStyle = {
  fillStyle: "#ff0000",
  strokeStyle: "#ff0000",
};

export const makeRendererMock = () => ({
  drawText: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 20 })),
  dispose: vi.fn(),
  hitTest: vi.fn(() => false),
  getBounds: vi.fn(() => undefined),
});

export const makeMeta = (): RenderMeta => ({
  canonicalMediaBounds: { x: 0, y: 0, width: 800, height: 600 },
});

export type DrawTextArgs = [
  string,
  { x: number; y: number },
  { fontStyle?: string; offset?: { bottom?: number } },
];

/** Render once through a mock renderer and return the `drawText` arguments. */
export const drawChip = (overlay: BaseOverlay<any>): DrawTextArgs => {
  const renderer = makeRendererMock();
  overlay.render(renderer as any, STYLE, makeMeta());
  return renderer.drawText.mock.calls[0] as unknown as DrawTextArgs;
};
