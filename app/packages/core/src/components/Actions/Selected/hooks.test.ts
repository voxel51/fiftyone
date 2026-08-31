// @vitest-environment jsdom

/**
 * Tests for useUnselectVisible.
 */

import { act, renderHook } from "@testing-library/react";
import React from "react";
import {
  DefaultValue,
  RecoilRoot,
  useRecoilValue,
  type MutableSnapshot,
} from "recoil";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  selectedLabels: null as any,
  selectedLabelMap: null as any,
}));

vi.mock("@fiftyone/state", async () => {
  const { atom, selector, DefaultValue: DV } = await import("recoil");

  stubs.selectedLabels = atom<any[]>({
    key: "_test/Selected/selectedLabels",
    default: [],
  });

  stubs.selectedLabelMap = selector<Record<string, any>>({
    key: "_test/Selected/selectedLabelMap",
    get: ({ get }) =>
      (get(stubs.selectedLabels) as any[]).reduce(
        (acc: Record<string, any>, { labelId, ...label }: any) => ({
          [labelId]: label,
          ...acc,
        }),
        {} as Record<string, any>,
      ),
    set: ({ set }, newValue) => {
      if (newValue instanceof DV) {
        set(stubs.selectedLabels, []);
        return;
      }
      set(
        stubs.selectedLabels,
        Object.entries(newValue as Record<string, any>).map(
          ([labelId, label]) => ({ ...label, labelId }),
        ),
      );
    },
  });

  return {
    selectedLabels: stubs.selectedLabels,
    selectedLabelMap: stubs.selectedLabelMap,
  };
});

const refs = vi.hoisted(() => ({
  scene: { clearSelection: vi.fn() } as {
    clearSelection: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({ scene: refs.scene }),
}));

import { overlaysToFrameLabels, useUnselectVisible } from "./hooks";

type LabelEntry = { sampleId: string; field: string; frameNumber?: number };
type LabelMap = Record<string, LabelEntry>;

//Creates a RecoilRoot wrapper pre-seeded with `initialMap`.
function makeWrapper(initialMap: LabelMap) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      RecoilRoot,
      {
        initializeState: ({ set }: MutableSnapshot) => {
          set(stubs.selectedLabelMap, initialMap);
        },
      },
      children,
    );
  };
}

describe("useUnselectVisible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.scene = { clearSelection: vi.fn() };
  });

  it("removes visible label IDs from selectedLabelMap", async () => {
    const initial: LabelMap = {
      "label-a": { sampleId: "s1", field: "detections" },
      "label-b": { sampleId: "s1", field: "detections" },
      "label-c": { sampleId: "s2", field: "detections" },
    };

    const { result } = renderHook(
      () => ({
        callback: useUnselectVisible(
          undefined,
          new Set(["label-a", "label-b"]),
        ),
        map: useRecoilValue(stubs.selectedLabelMap),
      }),
      { wrapper: makeWrapper(initial) },
    );

    await act(async () => {
      await result.current.callback();
    });

    expect(result.current.map).toEqual({
      "label-c": { sampleId: "s2", field: "detections" },
    });
  });

  it("leaves selectedLabelMap unchanged when no visible IDs match", async () => {
    const initial: LabelMap = {
      "label-a": { sampleId: "s1", field: "detections" },
    };

    const { result } = renderHook(
      () => ({
        callback: useUnselectVisible(undefined, new Set(["label-x"])),
        map: useRecoilValue(stubs.selectedLabelMap),
      }),
      { wrapper: makeWrapper(initial) },
    );

    await act(async () => {
      await result.current.callback();
    });

    expect(result.current.map).toEqual({
      "label-a": { sampleId: "s1", field: "detections" },
    });
  });

  it("produces an empty map when all labels are in the visible set", async () => {
    const initial: LabelMap = {
      "label-a": { sampleId: "s1", field: "detections" },
      "label-b": { sampleId: "s2", field: "detections" },
    };

    const { result } = renderHook(
      () => ({
        callback: useUnselectVisible(
          undefined,
          new Set(["label-a", "label-b"]),
        ),
        map: useRecoilValue(stubs.selectedLabelMap),
      }),
      { wrapper: makeWrapper(initial) },
    );

    await act(async () => {
      await result.current.callback();
    });

    expect(result.current.map).toEqual({});
  });

  it("calls scene.clearSelection when a lighter scene is present", async () => {
    const { result } = renderHook(
      () => useUnselectVisible(undefined, new Set(["label-a"])),
      {
        wrapper: makeWrapper({
          "label-a": { sampleId: "s1", field: "detections" },
        }),
      },
    );

    await act(async () => {
      await result.current();
    });

    expect(refs.scene!.clearSelection).toHaveBeenCalledOnce();
    expect(refs.scene!.clearSelection).toHaveBeenCalledWith({
      ignoreSideEffects: true,
    });
  });

  it("does not call scene.clearSelection when scene is null", async () => {
    refs.scene = null;
    const clearSelection = vi.fn();

    const { result } = renderHook(
      () => useUnselectVisible(undefined, new Set(["label-a"])),
      {
        wrapper: makeWrapper({
          "label-a": { sampleId: "s1", field: "detections" },
        }),
      },
    );

    await act(async () => {
      await result.current();
    });

    expect(clearSelection).not.toHaveBeenCalled();
  });

  it("works correctly with an empty initial selection", async () => {
    const { result } = renderHook(
      () => ({
        callback: useUnselectVisible(undefined, new Set(["label-x"])),
        map: useRecoilValue(stubs.selectedLabelMap),
      }),
      { wrapper: makeWrapper({}) },
    );

    await act(async () => {
      await result.current.callback();
    });

    expect(result.current.map).toEqual({});
  });

  it("retains only labelId-keyed entries after filtering (regression: array-index corruption)", async () => {
    const initial: LabelMap = {
      "label-a": { sampleId: "s1", field: "detections" },
      "label-b": { sampleId: "s2", field: "detections" },
    };

    const { result } = renderHook(
      () => ({
        callback: useUnselectVisible(undefined, new Set(["label-a"])),
        map: useRecoilValue(stubs.selectedLabelMap),
      }),
      { wrapper: makeWrapper(initial) },
    );

    await act(async () => {
      await result.current.callback();
    });

    const keys = Object.keys(result.current.map);

    // No numeric index keys must survive — a buggy read from the array would
    // produce "0" and "1" instead of the real labelIds. This tests against a previous regression.
    expect(keys).not.toContain("0");
    expect(keys).not.toContain("1");

    // The surviving label must be keyed by its actual labelId.
    expect(result.current.map).toEqual({
      "label-b": { sampleId: "s2", field: "detections" },
    });
  });
});

/**
 * Video Explore paints through Lighter and mounts no `Looker`, so the modal's
 * "select visible labels in this frame" action reads the scene's overlays
 * instead of `VideoLooker.getCurrentFrameLabels()`.
 */
describe("overlaysToFrameLabels", () => {
  const overlay = (
    id: string,
    field: string,
    label?: Record<string, unknown> | null,
  ) => ({ id, field, label });

  it("keeps only frames.* overlays", () => {
    const result = overlaysToFrameLabels(
      [
        overlay("o1", "frames.detections", { _id: "L1" }),
        overlay("o2", "ground_truth", { _id: "L2" }),
        overlay("o3", "frames.keypoints", { _id: "L3" }),
      ],
      "S1",
    );

    expect(result.map((label) => label.labelId)).toEqual(["L1", "L3"]);
    expect(result.every((label) => label.sampleId === "S1")).toBe(true);
  });

  it("addresses labels by their backend _id, not the overlay's instance id", () => {
    // The engine keys overlays by instance id; the selection atoms key by the
    // canonical label id, so confusing the two silently selects nothing.
    const [label] = overlaysToFrameLabels(
      [overlay("instance-1", "frames.detections", { _id: "L1" })],
      "S1",
    );

    expect(label.labelId).toBe("L1");
  });

  it("falls back to id, then the overlay id, when _id is absent", () => {
    const result = overlaysToFrameLabels(
      [
        overlay("o1", "frames.detections", { id: "L1" }),
        overlay("o2", "frames.detections", {}),
        overlay("o3", "frames.detections", null),
      ],
      "S1",
    );

    expect(result.map((label) => label.labelId)).toEqual(["L1", "o2", "o3"]);
  });

  it("carries frame_number through when present, and omits it otherwise", () => {
    const [withFrame, withoutFrame] = overlaysToFrameLabels(
      [
        overlay("o1", "frames.detections", { _id: "L1", frame_number: 7 }),
        overlay("o2", "frames.detections", { _id: "L2" }),
      ],
      "S1",
    );

    expect(withFrame.frameNumber).toBe(7);
    expect("frameNumber" in withoutFrame).toBe(false);
  });

  it("returns nothing for a scene with no overlays", () => {
    expect(overlaysToFrameLabels([], "S1")).toEqual([]);
  });
});
