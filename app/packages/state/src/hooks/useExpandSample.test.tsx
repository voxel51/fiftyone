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
  counted: vi.fn(() => 40),
  estimate: false,
  setExpanded: vi.fn(),
  setModalState: vi.fn(),
}));

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
vi.mock("../atoms/modal", async () => {
  const { atom } = await import("@fiftyone/reverb");
  return { modalPositions: atom({ key: "t/positions", default: null }) };
});
vi.mock("../atoms/pathData/counts", async () => {
  const { selector } = await import("@fiftyone/reverb");
  const counted = selector({ key: "t/count", get: () => harness.counted() });
  const estimate = selector({ key: "t/estimate", get: () => harness.estimate });
  return {
    GRID_COUNT: {},
    count: () => counted,
    countIsEstimate: () => estimate,
  };
});
vi.mock("./useSetExpandedSample", () => ({
  default: () => harness.setExpanded,
}));
vi.mock("./useSetModalState", () => ({
  default: () => harness.setModalState,
}));

import type { ModalNavigation, ModalPositions } from "../atoms/modal";
import { modalPositions } from "../atoms/modal";
import { count, GRID_COUNT } from "../atoms/pathData/counts";
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
    return { key: Math.floor(offset / 2), index: offset % 2, offset };
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
    positions: () => store.get(modalPositions) as ModalPositions | null,
  };
};

afterEach(() => {
  harness.estimate = false;
  vi.clearAllMocks();
});

describe("useExpandSample positions", () => {
  it("never counts for a position", async () => {
    const { positions } = await open(createStore(), 2);

    expect(positions()).toBeNull();
    expect(harness.counted).not.toHaveBeenCalled();
  });

  it("places the sample from the grid's count, and keeps it while stepping", async () => {
    const store = createStore();
    store.sub(count(GRID_COUNT), () => undefined);
    const { navigation, positions } = await open(store, 2);
    expect(harness.counted).toHaveBeenCalledTimes(1);

    expect(positions()?.total).toBe(40);
    expect(positions()?.offsetOf("s2")).toBe(2);

    await navigation.next();
    expect(positions()?.offsetOf("s3")).toBe(3);
    await navigation.previous(3);
    expect(positions()?.offsetOf("s0")).toBe(0);
    expect(harness.counted).toHaveBeenCalledTimes(1);
  });

  it("has no position when the count is an estimate", async () => {
    harness.estimate = true;
    const store = createStore();
    store.sub(count(GRID_COUNT), () => undefined);

    expect((await open(store, 2)).positions()).toBeNull();
  });
});
