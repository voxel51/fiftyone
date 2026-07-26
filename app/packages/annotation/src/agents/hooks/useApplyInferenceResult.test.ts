/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentTaskType } from "../types";

// ── Mocks ────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  class FakeDetectionOverlay {
    id = "overlay-id";
    field = "frames.detections";
    label: Record<string, unknown> = {};
    bounds = { x: 0, y: 0, width: 1, height: 1 };
    applyLabel = vi.fn();
    updateLabel = vi.fn();
  }

  return {
    useLighterSpy: vi.fn(),
    dispatchSpy: vi.fn(),
    FakeDetectionOverlay,
  };
});

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => hoisted.useLighterSpy(),
  useLighterEventBus: () => ({ dispatch: hoisted.dispatchSpy }),
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
  DetectionOverlay: hoisted.FakeDetectionOverlay,
  InteractiveDetectionHandler: class {
    constructor(_overlay: unknown) {}
  },
}));

// `useApplyInferenceResult` takes `createDetection` as an argument, so the
// only collaborator we have to mock at module scope is the lighter scene.

import { useApplyInferenceResult } from "./useApplyInferenceResult";

// ── Helpers ──────────────────────────────────────────────────────────────────

interface FakeOverlay {
  label: Record<string, unknown>;
  updateLabel: ReturnType<typeof vi.fn>;
}

const makeOverlay = (
  initialLabel: Record<string, unknown> = {},
): FakeOverlay => ({
  label: initialLabel,
  updateLabel: vi.fn(),
});

const setLighter = (opts: {
  scene?: unknown;
  getOverlayResult?: FakeOverlay | null;
}) => {
  const getOverlay = vi
    .fn()
    .mockReturnValue(opts.getOverlayResult ?? undefined);
  // Distinguish "key omitted" (use fake scene) from "key present but
  // undefined" (caller is asserting on the no-scene branch).
  const scene =
    "scene" in opts
      ? opts.scene
      : { id: "scene-1", getEventChannel: () => "channel-1" };
  hoisted.useLighterSpy.mockReturnValue({ scene, getOverlay });
  return { getOverlay };
};

const renderHandler = (createDetection: () => unknown) =>
  renderHook(() =>
    useApplyInferenceResult(
      createDetection as Parameters<typeof useApplyInferenceResult>[0],
    ),
  ).result.current;

const segmentResult = (
  labelId: string,
  bbox: [number, number, number, number],
  mask: unknown,
) => ({
  labelId,
  type: "sync" as const,
  taskType: AgentTaskType.SEGMENT,
  response: {
    detections: [{ bounding_box: bbox, mask }],
  } as never,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useApplyInferenceResult", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("applies bbox + mask from the inference response to the existing overlay", () => {
    const overlay = makeOverlay({ label: "cat", existing: "stay" });
    setLighter({ getOverlayResult: overlay });

    const mask = new Uint8Array([1, 2, 3]);
    const apply = renderHandler(() => null);

    apply(segmentResult("ov-1", [0.1, 0.2, 0.3, 0.4], mask));

    expect(overlay.updateLabel).toHaveBeenCalledTimes(1);
    const call = overlay.updateLabel.mock.calls[0][0];
    expect(call.bounding_box).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(call.mask).toBe(mask);
    // Existing fields are preserved (spread first, then overrides applied).
    expect(call.existing).toBe("stay");
    expect(call.label).toBe("cat");
  });

  it("creates a new detection when no overlay exists for the labelId", () => {
    const newOverlay = makeOverlay({ label: "" });
    const createDetection = vi.fn().mockReturnValue({ overlay: newOverlay });
    setLighter({ getOverlayResult: null });

    const apply = renderHandler(createDetection);

    apply(segmentResult("new-id", [0, 0, 1, 1], new Uint8Array([9])));

    expect(createDetection).toHaveBeenCalledTimes(1);
    expect(newOverlay.updateLabel).toHaveBeenCalledTimes(1);
    expect(newOverlay.updateLabel.mock.calls[0][0].bounding_box).toEqual([
      0, 0, 1, 1,
    ]);
  });

  it("emits overlay-establish for a newly created detection overlay", () => {
    const newOverlay = new hoisted.FakeDetectionOverlay();
    const createDetection = vi.fn().mockReturnValue({ overlay: newOverlay });
    setLighter({ getOverlayResult: null });

    const apply = renderHandler(createDetection);

    apply(segmentResult("new-det", [0.1, 0.2, 0.3, 0.4], new Uint8Array([1])));

    expect(hoisted.dispatchSpy).toHaveBeenCalledWith(
      "lighter:overlay-establish",
      expect.objectContaining({ overlayId: newOverlay.id }),
    );
  });

  it("does not emit overlay-establish when updating an existing overlay", () => {
    const overlay = new hoisted.FakeDetectionOverlay();
    setLighter({ getOverlayResult: overlay });

    const apply = renderHandler(() => null);

    apply(segmentResult(overlay.id, [0, 0, 1, 1], new Uint8Array([1])));

    expect(hoisted.dispatchSpy).not.toHaveBeenCalled();
  });

  it("warns and skips the update when createDetection returns null", () => {
    const createDetection = vi.fn().mockReturnValue(null);
    setLighter({ getOverlayResult: null });

    const apply = renderHandler(createDetection);

    apply(segmentResult("missing", [0, 0, 1, 1], null));

    expect(warnSpy).toHaveBeenCalledWith("Unable to create overlay");
  });

  it("warns and skips the update when createDetection returns an entry without overlay", () => {
    const createDetection = vi.fn().mockReturnValue({ overlay: null });
    setLighter({ getOverlayResult: null });

    const apply = renderHandler(createDetection);

    apply(segmentResult("missing", [0, 0, 1, 1], null));

    expect(warnSpy).toHaveBeenCalledWith("Unable to create overlay");
  });

  it("is a no-op when the lighter scene is not yet initialized", () => {
    const overlay = makeOverlay();
    const createDetection = vi.fn();
    setLighter({ scene: undefined, getOverlayResult: overlay });

    const apply = renderHandler(createDetection);

    apply(segmentResult("ov-1", [0, 0, 1, 1], null));

    // No createDetection call, no updateLabel call, no warn.
    expect(createDetection).not.toHaveBeenCalled();
    expect(overlay.updateLabel).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns on unsupported task type and never touches the overlay", () => {
    const overlay = makeOverlay();
    setLighter({ getOverlayResult: overlay });

    const apply = renderHandler(() => null);

    apply({
      labelId: "ov-1",
      type: "sync",
      taskType: AgentTaskType.DETECT,
      response: { detections: [] } as never,
    });

    expect(overlay.updateLabel).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      `Unsupported task type: ${AgentTaskType.DETECT}`,
    );
  });

  it("warns on async results (caller is expected to use agent.subscribe())", () => {
    const overlay = makeOverlay();
    setLighter({ getOverlayResult: overlay });

    const apply = renderHandler(() => null);

    apply({
      labelId: "ov-1",
      type: "async",
      sessionId: "session-1",
    });

    expect(overlay.updateLabel).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("Unsupported result type: async");
  });

  it("falls back gracefully when the response carries no detections", () => {
    const overlay = makeOverlay({ label: "cat" });
    setLighter({ getOverlayResult: overlay });

    const apply = renderHandler(() => null);

    apply({
      labelId: "ov-1",
      type: "sync",
      taskType: AgentTaskType.SEGMENT,
      response: { detections: [] } as never,
    });

    expect(overlay.updateLabel).toHaveBeenCalledTimes(1);
    const call = overlay.updateLabel.mock.calls[0][0];
    // bbox/mask come back undefined; the spread preserves prior label values.
    expect(call.bounding_box).toBeUndefined();
    expect(call.mask).toBeUndefined();
    expect(call.label).toBe("cat");
  });
});
