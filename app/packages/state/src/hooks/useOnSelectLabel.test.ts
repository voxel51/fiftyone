// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import React from "react";
import {
  DefaultValue as DV,
  RecoilRoot,
  useRecoilValue,
  type MutableSnapshot,
  type RecoilState,
  type RecoilValueReadOnly,
} from "recoil";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The shape of the selection atoms, restated so the stubs need no `any`. */
interface SelectedLabel {
  labelId: string;
  field: string;
  sampleId: string;
  frameNumber?: number;
}
type LabelData = Omit<SelectedLabel, "labelId">;
type LabelMap = Record<string, LabelData>;

const stubs = vi.hoisted(() => ({
  selectedLabels: null as unknown as RecoilState<SelectedLabel[]>,
  selectedLabelMap: null as unknown as RecoilState<LabelMap>,
  selectedLabelIds: null as unknown as RecoilValueReadOnly<Set<string>>,
  modalSampleId: null as unknown as RecoilState<string>,
}));

// The module under test reaches the atoms through the package index, which is
// far too heavy to pull into a unit test. Only the atoms are stubbed — the
// delta logic exercised below is the real thing.
vi.mock("..", async () => {
  const { atom, selector } = await import("recoil");

  stubs.selectedLabels = atom<SelectedLabel[]>({
    key: "_test/OnSelectLabel/selectedLabels",
    default: [],
  });

  stubs.modalSampleId = atom<string>({
    key: "_test/OnSelectLabel/modalSampleId",
    default: "s1",
  });

  stubs.selectedLabelMap = selector<LabelMap>({
    key: "_test/OnSelectLabel/selectedLabelMap",
    get: ({ get }) =>
      get(stubs.selectedLabels).reduce<LabelMap>(
        (acc, { labelId, ...label }) => ({ [labelId]: label, ...acc }),
        {},
      ),
    set: ({ set }, newValue) => {
      if (newValue instanceof DV) {
        set(stubs.selectedLabels, []);
        return;
      }
      set(
        stubs.selectedLabels,
        Object.entries(newValue).map(([labelId, label]) => ({
          ...label,
          labelId,
        })),
      );
    },
  });

  stubs.selectedLabelIds = selector<Set<string>>({
    key: "_test/OnSelectLabel/selectedLabelIds",
    get: ({ get }) => new Set(Object.keys(get(stubs.selectedLabelMap))),
  });

  return {
    selectedLabels: stubs.selectedLabels,
    selectedLabelMap: stubs.selectedLabelMap,
    selectedLabelIds: stubs.selectedLabelIds,
    modalSampleId: stubs.modalSampleId,
  };
});

const { useApplySelectedLabelsDelta, useSelectedLabelIds, useModalSampleId } =
  await import("./useOnSelectLabel");

const label = (labelId: string) => ({
  labelId,
  field: "frames.detections",
  sampleId: "s1",
});

const wrapper =
  (initial: LabelMap = {}) =>
  ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      RecoilRoot,
      {
        initializeState: ({ set }: MutableSnapshot) => {
          set(stubs.selectedLabelMap, initial);
        },
      },
      children,
    );

const mount = (initial: LabelMap = {}) =>
  renderHook(
    () => ({
      apply: useApplySelectedLabelsDelta(),
      map: useRecoilValue(stubs.selectedLabelMap),
    }),
    { wrapper: wrapper(initial) },
  );

describe("useApplySelectedLabelsDelta", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds labels without disturbing the rest", async () => {
    const { result } = mount({ "label-a": { field: "f", sampleId: "s1" } });

    await act(async () => {
      result.current.apply({ add: [label("label-b")] });
    });

    expect(Object.keys(result.current.map).sort()).toEqual([
      "label-a",
      "label-b",
    ]);
  });

  it("removes by id and ignores ids it does not hold", async () => {
    const { result } = mount({
      "label-a": { field: "f", sampleId: "s1" },
      "label-b": { field: "f", sampleId: "s1" },
    });

    await act(async () => {
      result.current.apply({ remove: ["label-a", "never-selected"] });
    });

    expect(Object.keys(result.current.map)).toEqual(["label-b"]);
  });

  it("applies both halves of one delta together", async () => {
    const { result } = mount({ "label-a": { field: "f", sampleId: "s1" } });

    await act(async () => {
      result.current.apply({ add: [label("label-b")], remove: ["label-a"] });
    });

    expect(Object.keys(result.current.map)).toEqual(["label-b"]);
  });

  /**
   * Callers can be driven by state derived FROM this atom — a canvas mirroring
   * the selection back. Republishing an unchanged map would hand every derived
   * selector a fresh identity and kick those observers off again for nothing.
   */
  it("publishes nothing when the delta changes nothing", async () => {
    const { result } = mount({ "label-a": { field: "f", sampleId: "s1" } });
    const before = result.current.map;

    await act(async () => {
      result.current.apply({
        add: [label("label-a")],
        remove: ["never-selected"],
      });
    });

    expect(result.current.map).toBe(before);
  });

  it("copes with an empty delta", async () => {
    const { result } = mount({});

    await act(async () => {
      result.current.apply({});
    });

    expect(result.current.map).toEqual({});
  });
});

describe("label selection read accessors", () => {
  it("exposes the selected ids without the caller touching recoil", () => {
    const { result } = renderHook(() => useSelectedLabelIds(), {
      wrapper: wrapper({
        "label-a": { field: "f", sampleId: "s1" },
        "label-b": { field: "f", sampleId: "s1" },
      }),
    });

    expect([...result.current].sort()).toEqual(["label-a", "label-b"]);
  });

  it("exposes the modal sample id", () => {
    const { result } = renderHook(() => useModalSampleId(), {
      wrapper: wrapper({}),
    });

    expect(result.current).toBe("s1");
  });
});
