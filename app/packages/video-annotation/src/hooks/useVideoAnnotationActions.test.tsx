/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  markKeyframe: vi.fn(),
  gates: vi.fn(),
  /** The presented frame, deliberately not derivable from any raw time here. */
  frame: 7,
}));

vi.mock("@voxel51/voodo", () => ({
  Icon: () => null,
  IconName: {},
  Size: {},
}));

vi.mock("@fiftyone/state", () => ({
  useModalSample: () => null,
}));

vi.mock("../components/AiTrackUpsellButton", () => ({
  AiTrackUpsellButton: () => null,
}));

vi.mock("../components/KeyframeDiamondIcon", () => ({
  KeyframeDiamondIcon: () => null,
}));

vi.mock("../state/useCurrentFrame", () => ({
  useCurrentFrame: () => h.frame,
}));

vi.mock("./useTemporalDetectionTarget", () => ({
  useTemporalDetectionTarget: () => ({
    fieldPath: null,
    defaultLabel: undefined,
    fps: 30,
    hasUsableFps: true,
    canCreate: false,
  }),
}));

vi.mock("./useTrackSelectionGates", () => ({
  useTrackSelectionGates: (...args: unknown[]) => {
    h.gates(...args);
    return {
      selectedIds: ["instance-A"],
      hasSelection: true,
      selectionIsKeyframeable: true,
      selectionIsInstanceTrack: true,
      selectedTrackField: null,
      isKeyframeAtPlayhead: false,
      canMarkKeyframe: true,
      canSplit: true,
    };
  },
}));

vi.mock("./useVideoSurfaceActions", () => ({
  useVideoSurfaceActions: () => ({ markKeyframe: h.markKeyframe }),
}));

import { useVideoAnnotationActions } from "./useVideoAnnotationActions";

const action = (id: string) => {
  const { result } = renderHook(() => useVideoAnnotationActions());
  return result.current
    .flatMap((group) => group.actions)
    .find((item) => item.id === id)!;
};

describe("useVideoAnnotationActions", () => {
  beforeEach(() => {
    h.markKeyframe.mockClear();
    h.gates.mockClear();
  });

  it("Mark Keyframe marks the presented frame", () => {
    action("mark-keyframe").onClick();

    expect(h.markKeyframe).toHaveBeenCalledWith(7, ["instance-A"]);
  });

  it("the keyframe icon state is read at the same presented frame", () => {
    action("mark-keyframe");

    expect(h.gates).toHaveBeenCalledWith(7, true);
  });
});
