/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Hoist mock classes + the useLighter spy so they survive vi.mock hoisting.
const hoisted = vi.hoisted(() => {
  class MockDetectionOverlay {
    public field = "predictions";
    public id = "ov-1";
    public isPersistent = true;
    public relativeBounds = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    public label: Record<string, unknown> = { label: "cat" };
    public hasMask = () => false;
    public getPendingMask = () => undefined;
  }
  class MockClassificationOverlay {}
  class MockKeypointOverlay {}
  class MockPolylineOverlay {}
  return {
    MockDetectionOverlay,
    MockClassificationOverlay,
    MockKeypointOverlay,
    MockPolylineOverlay,
    useLighterSpy: vi.fn(),
  };
});

const MockDetectionOverlay = hoisted.MockDetectionOverlay;
const mockUseLighter = hoisted.useLighterSpy;

vi.mock("@fiftyone/lighter", () => ({
  DetectionOverlay: hoisted.MockDetectionOverlay,
  ClassificationOverlay: hoisted.MockClassificationOverlay,
  KeypointOverlay: hoisted.MockKeypointOverlay,
  PolylineOverlay: hoisted.MockPolylineOverlay,
  useLighter: () => hoisted.useLighterSpy(),
}));

vi.mock("@fiftyone/looker", () => ({}));
vi.mock("@fiftyone/looker/src/overlays/classifications", () => ({}));
vi.mock("@fiftyone/looker/src/overlays/polyline", () => ({}));
vi.mock("@fiftyone/looker/src/state", () => ({ BoundingBox: undefined }));

vi.mock("@fiftyone/state", () => ({
  isPatchesView: "isPatchesView-recoil-key",
}));

vi.mock("@fiftyone/utilities", () => ({
  hasValidBounds: vi.fn().mockReturnValue(true),
}));

const hoistedSpies = vi.hoisted(() => ({
  useRecoilValueSpy: vi.fn(),
  useGetLabelDeltaSpy: vi.fn(),
  buildAnnotationPathSpy: vi.fn((proxy: { path?: string }, _isPatches: boolean) =>
    `built-path/${proxy.path ?? "no-path"}`
  ),
}));
const mockUseRecoilValue = hoistedSpies.useRecoilValueSpy;
const mockUseGetLabelDelta = hoistedSpies.useGetLabelDeltaSpy;
const mockBuildAnnotationPath = hoistedSpies.buildAnnotationPathSpy;

vi.mock("recoil", () => ({
  useRecoilValue: (key: unknown) => hoistedSpies.useRecoilValueSpy(key),
}));

vi.mock("./useGetLabelDelta", () => ({
  useGetLabelDelta: (...args: unknown[]) =>
    hoistedSpies.useGetLabelDeltaSpy(...args),
}));

vi.mock("../deltas", () => ({
  buildAnnotationPath: (...args: unknown[]) =>
    hoistedSpies.buildAnnotationPathSpy(
      ...(args as [{ path?: string }, boolean])
    ),
}));

import { useLighterDeltaSupplier } from "./useLighterDeltaSupplier";

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeScene = (overlays: unknown[]) => ({
  getAllOverlays: vi.fn().mockReturnValue(overlays),
});

const setIsPatches = (isPatches: boolean) => {
  mockUseRecoilValue.mockReturnValue(isPatches);
};

const setLabelDeltaResponses = (
  responses: Array<Array<{ op: string; path: string; value: unknown }>>
) => {
  const fn = vi.fn();
  responses.forEach((r) => fn.mockReturnValueOnce(r));
  fn.mockReturnValue([]); // default for any extra overlays
  mockUseGetLabelDelta.mockReturnValue(fn);
  return fn;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useLighterDeltaSupplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setIsPatches(false);
  });

  it("returns empty deltas when the scene has no overlays", () => {
    mockUseLighter.mockReturnValue({ scene: makeScene([]) });
    setLabelDeltaResponses([]);

    const { result } = renderHook(() => useLighterDeltaSupplier());
    expect(result.current()).toEqual({ deltas: [], metadata: undefined });
  });

  it("returns empty deltas when the scene is undefined (uninitialized lighter)", () => {
    mockUseLighter.mockReturnValue({ scene: undefined });
    setLabelDeltaResponses([]);

    const { result } = renderHook(() => useLighterDeltaSupplier());
    expect(result.current()).toEqual({ deltas: [], metadata: undefined });
  });

  it("aggregates deltas from every overlay that produces them", () => {
    const overlayA = new MockDetectionOverlay();
    const overlayB = new MockDetectionOverlay();
    const overlayC = new MockDetectionOverlay();
    overlayA.id = "a";
    overlayB.id = "b";
    overlayC.id = "c";

    mockUseLighter.mockReturnValue({
      scene: makeScene([overlayA, overlayB, overlayC]),
    });

    const deltaA = [{ op: "replace", path: "/a", value: 1 }];
    const deltaB: any[] = []; // no changes
    const deltaC = [
      { op: "replace", path: "/c1", value: 2 },
      { op: "replace", path: "/c2", value: 3 },
    ];
    setLabelDeltaResponses([deltaA, deltaB, deltaC]);

    const { result } = renderHook(() => useLighterDeltaSupplier());
    expect(result.current()).toEqual({
      deltas: [...deltaA, ...deltaC],
      metadata: undefined,
    });
  });

  it("calls getLabelDelta(overlay, overlay.field) for each overlay", () => {
    const overlay = new MockDetectionOverlay();
    overlay.field = "my_detections";
    mockUseLighter.mockReturnValue({ scene: makeScene([overlay]) });
    const getLabelDelta = setLabelDeltaResponses([[]]);

    const { result } = renderHook(() => useLighterDeltaSupplier());
    result.current();

    expect(getLabelDelta).toHaveBeenCalledTimes(1);
    expect(getLabelDelta).toHaveBeenCalledWith(overlay, "my_detections");
  });

  it("non-patches view: never sets metadata, even when there are changes", () => {
    const overlay = new MockDetectionOverlay();
    mockUseLighter.mockReturnValue({ scene: makeScene([overlay]) });
    setLabelDeltaResponses([[{ op: "replace", path: "/x", value: 1 }]]);
    setIsPatches(false);

    const { result } = renderHook(() => useLighterDeltaSupplier());
    const out = result.current();

    expect(out.metadata).toBeUndefined();
    expect(mockBuildAnnotationPath).not.toHaveBeenCalled();
  });

  it("patches view: sets metadata using the first changed overlay's id and built path", () => {
    const unchanged = new MockDetectionOverlay();
    unchanged.id = "unchanged-id";
    const changedFirst = new MockDetectionOverlay();
    changedFirst.id = "first-changed";
    changedFirst.field = "detections";
    const changedSecond = new MockDetectionOverlay();
    changedSecond.id = "second-changed";

    mockUseLighter.mockReturnValue({
      scene: makeScene([unchanged, changedFirst, changedSecond]),
    });
    setLabelDeltaResponses([
      [],
      [{ op: "replace", path: "/a", value: 1 }],
      [{ op: "replace", path: "/b", value: 2 }],
    ]);
    setIsPatches(true);

    const { result } = renderHook(() => useLighterDeltaSupplier());
    const out = result.current();

    expect(out.deltas).toHaveLength(2);
    expect(out.metadata).toEqual({
      labelId: "first-changed",
      labelPath: "built-path/detections",
    });
    expect(mockBuildAnnotationPath).toHaveBeenCalledTimes(1);
  });

  it("patches view + no changes: leaves metadata undefined", () => {
    const overlay = new MockDetectionOverlay();
    mockUseLighter.mockReturnValue({ scene: makeScene([overlay]) });
    setLabelDeltaResponses([[]]);
    setIsPatches(true);

    const { result } = renderHook(() => useLighterDeltaSupplier());
    const out = result.current();

    expect(out.deltas).toEqual([]);
    expect(out.metadata).toBeUndefined();
  });
});
