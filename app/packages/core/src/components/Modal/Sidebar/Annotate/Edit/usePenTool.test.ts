/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// Provide real classes for DetectionOverlay (so `instanceof` matches) and
// InteractivePenHandler (so we can spy on construction + cleanup).

const hoisted = vi.hoisted(() => {
  class MockDetectionOverlay {
    public id: string;
    constructor(id = "ov-1") {
      this.id = id;
    }
  }
  class MockInteractivePenHandler {
    public readonly overlay: MockDetectionOverlay;
    public cleanup = vi.fn();
    constructor(overlay: MockDetectionOverlay) {
      this.overlay = overlay;
    }
  }
  return {
    MockDetectionOverlay,
    MockInteractivePenHandler,
  };
});

vi.mock("@fiftyone/lighter", () => ({
  DetectionOverlay: hoisted.MockDetectionOverlay,
  InteractivePenHandler: hoisted.MockInteractivePenHandler,
}));

// SegmentationTool comes from a sibling file; load the real implementation.
import { SegmentationTool } from "./useManualSegmentationTools";
import { usePenTool, type UsePenToolArgs } from "./usePenTool";

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeScene = () => ({
  enterInteractiveMode: vi.fn(),
  exitInteractiveMode: vi.fn(),
});

const makeOverlay = (id = "ov-1") => new hoisted.MockDetectionOverlay(id);

const baseArgs = (
  overrides: Partial<UsePenToolArgs> = {}
): UsePenToolArgs => ({
  scene: makeScene() as never,
  segmentationModeActive: true,
  tool: SegmentationTool.Pen,
  selectedOverlay: makeOverlay() as never,
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("usePenTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.MockInteractivePenHandler.prototype.cleanup = vi.fn();
  });

  describe("install conditions (all four must hold)", () => {
    it("installs a pen handler when scene + segMode + Pen tool + DetectionOverlay align", () => {
      const args = baseArgs();
      renderHook(() => usePenTool(args));

      const scene = args.scene as ReturnType<typeof makeScene>;
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(1);
      expect(scene.enterInteractiveMode.mock.calls[0][0]).toBeInstanceOf(
        hoisted.MockInteractivePenHandler
      );
    });

    it("does not install when scene is undefined", () => {
      // No way to spy on a non-existent scene; rely on the constructor spy
      // for InteractivePenHandler instead.
      const ctorSpy = vi.spyOn(hoisted, "MockInteractivePenHandler");
      renderHook(() => usePenTool(baseArgs({ scene: undefined })));
      expect(ctorSpy).not.toHaveBeenCalled();
      ctorSpy.mockRestore();
    });

    it.each([
      ["segmentation mode inactive", { segmentationModeActive: false }],
      ["tool is not Pen", { tool: SegmentationTool.Brush }],
      ["no overlay selected", { selectedOverlay: undefined }],
      ["selected overlay is not a DetectionOverlay", { selectedOverlay: { id: "x" } as never }],
    ])("does not install when %s", (_label, overrides) => {
      const args = baseArgs(overrides);
      renderHook(() => usePenTool(args));
      const scene = args.scene as ReturnType<typeof makeScene>;
      expect(scene.enterInteractiveMode).not.toHaveBeenCalled();
    });
  });

  describe("re-render behavior", () => {
    it("skips re-install when re-rendered against the same selectedOverlay", () => {
      const args = baseArgs();
      const { rerender } = renderHook(({ a }: { a: UsePenToolArgs }) => usePenTool(a), {
        initialProps: { a: args },
      });

      const scene = args.scene as ReturnType<typeof makeScene>;
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(1);

      rerender({ a: args });
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(1);
    });

    it("re-installs when selectedOverlay changes (new detection picked up)", () => {
      const scene = makeScene();
      const initial = baseArgs({ scene: scene as never, selectedOverlay: makeOverlay("a") as never });
      const { rerender } = renderHook(
        ({ a }: { a: UsePenToolArgs }) => usePenTool(a),
        { initialProps: { a: initial } }
      );
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(1);

      const next = baseArgs({ scene: scene as never, selectedOverlay: makeOverlay("b") as never });
      rerender({ a: next });

      // Exit-then-enter cycle: exitInteractiveMode for the previous handler,
      // plus the "flip off before re-entering" defensive exit, then enter the
      // new handler.
      expect(scene.exitInteractiveMode).toHaveBeenCalled();
      expect(scene.enterInteractiveMode).toHaveBeenCalledTimes(2);
      const lastHandler =
        scene.enterInteractiveMode.mock.calls[1][0] as InstanceType<
          typeof hoisted.MockInteractivePenHandler
        >;
      expect(lastHandler.overlay.id).toBe("b");
    });

    it("tears down the handler when the tool switches away from Pen", () => {
      const scene = makeScene();
      const args = baseArgs({ scene: scene as never });
      const { rerender } = renderHook(
        ({ a }: { a: UsePenToolArgs }) => usePenTool(a),
        { initialProps: { a: args } }
      );

      const handler = scene.enterInteractiveMode.mock.calls[0][0] as InstanceType<
        typeof hoisted.MockInteractivePenHandler
      >;
      expect(handler.cleanup).not.toHaveBeenCalled();

      rerender({
        a: baseArgs({ scene: scene as never, tool: SegmentationTool.Brush }),
      });

      expect(handler.cleanup).toHaveBeenCalledTimes(1);
      expect(scene.exitInteractiveMode).toHaveBeenCalled();
    });

    it("tears down the handler when segmentation mode is deactivated", () => {
      const scene = makeScene();
      const args = baseArgs({ scene: scene as never });
      const { rerender } = renderHook(
        ({ a }: { a: UsePenToolArgs }) => usePenTool(a),
        { initialProps: { a: args } }
      );
      const handler = scene.enterInteractiveMode.mock.calls[0][0] as InstanceType<
        typeof hoisted.MockInteractivePenHandler
      >;

      rerender({
        a: baseArgs({ scene: scene as never, segmentationModeActive: false }),
      });

      expect(handler.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe("unmount", () => {
    it("cleans up the installed handler on unmount", () => {
      const scene = makeScene();
      const args = baseArgs({ scene: scene as never });
      const { unmount } = renderHook(() => usePenTool(args));

      const handler = scene.enterInteractiveMode.mock.calls[0][0] as InstanceType<
        typeof hoisted.MockInteractivePenHandler
      >;

      unmount();

      expect(handler.cleanup).toHaveBeenCalledTimes(1);
      expect(scene.exitInteractiveMode).toHaveBeenCalled();
    });

    it("unmount is safe when no handler was ever installed", () => {
      const scene = makeScene();
      const { unmount } = renderHook(() =>
        usePenTool(
          baseArgs({ scene: scene as never, tool: SegmentationTool.Select })
        )
      );

      expect(() => unmount()).not.toThrow();
    });
  });
});
