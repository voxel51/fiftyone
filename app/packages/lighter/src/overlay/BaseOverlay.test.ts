/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import type { Renderer2D } from "../renderer/Renderer2D";
// Via a concrete overlay: importing BaseOverlay directly trips a Scene2D circular import.
import { DetectionOverlay } from "./DetectionOverlay";

const fakeRenderer = () =>
  ({
    dispose: vi.fn(),
  }) as unknown as Renderer2D & { dispose: ReturnType<typeof vi.fn> };

const makeOverlay = (id: string) =>
  new DetectionOverlay({
    id,
    field: "ground_truth",
    label: { _id: id, _cls: "Detection" } as never,
  });

describe("BaseOverlay.destroy (via DetectionOverlay)", () => {
  it("disposes the overlay's renderer container", () => {
    const overlay = makeOverlay("ov-1");
    const renderer = fakeRenderer();
    overlay.setRenderer(renderer);

    overlay.destroy();

    // The last-rendered container must be torn down to free its canvas-backed textures.
    expect(renderer.dispose).toHaveBeenCalledWith("ov-1");
  });

  it("does not throw when destroyed before a renderer was attached", () => {
    const overlay = makeOverlay("ov-2");
    expect(() => overlay.destroy()).not.toThrow();
  });
});
