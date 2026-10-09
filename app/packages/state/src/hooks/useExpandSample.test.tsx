/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  setExpanded: vi.fn(),
  setModalState: vi.fn(),
}));

const INPUT = { dataset: "d", view: [], sortBy: "score", desc: true };

vi.mock("../atoms/atoms", async () => {
  const { atom } = await import("@fiftyone/reverb");
  return { selectedSamples: atom({ key: "t/selected", default: new Map() }) };
});
vi.mock("../atoms/groups", async () => {
  const { constSelector } = await import("@fiftyone/reverb");
  return {
    groupField: constSelector("group"),
    hasGroupSlices: constSelector(false),
  };
});
vi.mock("../atoms/order", async () => {
  const { atom, constSelector } = await import("@fiftyone/reverb");
  return {
    gridOrderInput: constSelector({
      dataset: "d",
      view: [],
      sortBy: "score",
      desc: true,
    }),
    modalOrderInput: atom({ key: "t/order", default: null }),
  };
});
vi.mock("./useSetExpandedSample", () => ({
  default: () => harness.setExpanded,
}));
vi.mock("./useSetModalState", () => ({
  default: () => harness.setModalState,
}));

import type { ModalNavigation } from "../atoms/modal";
import { modalOrderInput } from "../atoms/order";
import useExpandSample from "./useExpandSample";

// three pages of two, in the grid's order: s0 s1 | s2 s3 | s4 s5
const item = (offset: number) => ({
  id: { description: `s${offset}` },
  data: { sample: {} },
});
const pages = {
  get: async (key: number) => ({
    items: [item(key * 2), item(key * 2 + 1)],
    next: key < 2 ? key + 1 : null,
    previous: key > 0 ? key - 1 : null,
  }),
  positionOf: (id: string) => {
    const offset = Number(id.slice(1));
    return { key: Math.floor(offset / 2), index: offset % 2 };
  },
};

const open = async (store: ReturnType<typeof createStore>, offset: number) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(() => useExpandSample(pages), { wrapper });
  await act(() =>
    result.current({ item: item(offset) } as Parameters<
      typeof result.current
    >[0]),
  );
  return {
    navigation: harness.setModalState.mock.calls.at(-1)?.[0] as ModalNavigation,
    order: () => store.get(modalOrderInput),
  };
};

afterEach(() => vi.clearAllMocks());

describe("useExpandSample", () => {
  it("remembers the grid order it opened from, for the header's position", async () => {
    const { order } = await open(createStore(), 2);

    expect(order()).toEqual(INPUT);
  });

  it("steps through the grid's pages", async () => {
    const { navigation } = await open(createStore(), 2);

    expect((await navigation.next()).id).toBe("s3");
    expect((await navigation.previous(3)).id).toBe("s0");
    expect(harness.setExpanded).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s2", hasNext: true, hasPrevious: true }),
    );
  });
});
