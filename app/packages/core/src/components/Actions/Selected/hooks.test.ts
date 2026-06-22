// @vitest-environment jsdom

/**
 * Tests for useUnselectVisible.
 *
 * Regression: Before the fix, the hook read from fos.selectedLabels (an array)
 * instead of fos.selectedLabelMap (a {labelId: labelData} object). This caused
 * Object.entries() to iterate the numeric array indices, writing keys like "0",
 * "1", "2" into selectedLabelMap instead of the real labelIds — permanently
 * corrupting selection state so that the "Manage Selected" badge showed the
 * wrong count after deselecting visible labels.
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

// ── Atom/selector stubs ────────────────────────────────────────────────────
// vi.hoisted ensures these refs exist as a mutable container before any
// vi.mock factory or import runs. The async factory populates them.
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
        {} as Record<string, any>
      ),
    set: ({ set }, newValue) => {
      if (newValue instanceof DV) {
        set(stubs.selectedLabels, []);
        return;
      }
      set(
        stubs.selectedLabels,
        Object.entries(newValue as Record<string, any>).map(
          ([labelId, label]) => ({ ...label, labelId })
        )
      );
    },
  });

  return {
    selectedLabels: stubs.selectedLabels,
    selectedLabelMap: stubs.selectedLabelMap,
  };
});

// ── Lighter scene mock ─────────────────────────────────────────────────────
const refs = vi.hoisted(() => ({
  scene: { clearSelection: vi.fn() } as {
    clearSelection: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({ scene: refs.scene }),
}));

import { useUnselectVisible } from "./hooks";

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
      children
    );
  };
}

describe("useUnselectVisible", () => {
  beforeEach(() => {
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
          new Set(["label-a", "label-b"])
        ),
        map: useRecoilValue(stubs.selectedLabelMap),
      }),
      { wrapper: makeWrapper(initial) }
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
      { wrapper: makeWrapper(initial) }
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
          new Set(["label-a", "label-b"])
        ),
        map: useRecoilValue(stubs.selectedLabelMap),
      }),
      { wrapper: makeWrapper(initial) }
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
      }
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
      }
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
      { wrapper: makeWrapper({}) }
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
      { wrapper: makeWrapper(initial) }
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
