import { act, cleanup, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hiddenBoundingBoxesAtom } from "../bounding-boxes/model/atoms";
import { useLookerOptions } from "./looker";
import { datasetId } from "./selectors";

const mocks = vi.hoisted(() => ({
  datasetId: "dataset",
  options: { alpha: 0.7 },
}));

// stand in for the Recoil reads: the resolved looker options selector, and
// the current dataset id
vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  return {
    ...actual,
    useRecoilValue: (value: unknown) =>
      value === datasetId ? mocks.datasetId : mocks.options,
    useRecoilValueLoadable: () => ({ contents: mocks.options }),
  };
});

const wrapper =
  (store = createStore()) =>
  ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

// atoms are cached per dataset across tests, so each test uses its own id
let testIndex = 0;
beforeEach(() => {
  testIndex += 1;
  mocks.datasetId = `dataset-${testIndex}`;
  localStorage.clear();
});

afterEach(cleanup);

describe("useLookerOptions", () => {
  it("adds the hidden bounding boxes to the selector's options", () => {
    const store = createStore();
    store.set(hiddenBoundingBoxesAtom(mocks.datasetId), ["ground_truth"]);

    const { result } = renderHook(() => useLookerOptions(true), {
      wrapper: wrapper(store),
    });

    expect(result.current).toEqual({
      alpha: 0.7,
      hiddenBoundingBoxes: ["ground_truth"],
    });
  });

  it("keeps its identity across renders", () => {
    const { result, rerender } = renderHook(() => useLookerOptions(true), {
      wrapper: wrapper(),
    });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("changes when a field's boxes are hidden", () => {
    const store = createStore();
    const { result } = renderHook(() => useLookerOptions(true), {
      wrapper: wrapper(store),
    });

    const first = result.current;
    act(() => {
      store.set(hiddenBoundingBoxesAtom(mocks.datasetId), ["ground_truth"]);
    });

    expect(result.current).not.toBe(first);
    expect(result.current.hiddenBoundingBoxes).toEqual(["ground_truth"]);
  });
});
