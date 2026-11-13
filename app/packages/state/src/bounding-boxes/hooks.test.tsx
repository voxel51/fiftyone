import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useBoundingBoxVisibility,
  useToggleBoundingBoxVisibility,
} from "./hooks";

const mocks = vi.hoisted(() => ({ datasetId: "dataset" }));
vi.mock("../accessors/dataset", () => ({
  useCurrentDatasetId: () => mocks.datasetId,
}));

const storageKey = (datasetId: string) =>
  `fiftyone:hidden-bounding-boxes:${datasetId}`;

const wrapper =
  (store = createStore()) =>
  ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

const useFieldBoxes = (labelPath: string) => ({
  isShown: useBoundingBoxVisibility(labelPath),
  toggle: useToggleBoundingBoxVisibility(labelPath),
});

// atoms are cached per dataset across tests, so each test uses its own id
let testIndex = 0;
beforeEach(() => {
  testIndex += 1;
  mocks.datasetId = `dataset-${testIndex}`;
  localStorage.clear();
});

afterEach(cleanup);

describe("bounding box visibility", () => {
  it("shows boxes by default", () => {
    const { result } = renderHook(() => useFieldBoxes("ground_truth"), {
      wrapper: wrapper(),
    });

    expect(result.current.isShown).toBe(true);
  });

  it("hides and re-shows a field's boxes", () => {
    const { result } = renderHook(() => useFieldBoxes("ground_truth"), {
      wrapper: wrapper(),
    });

    act(() => result.current.toggle());
    expect(result.current.isShown).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.isShown).toBe(true);
  });

  it("hides only the toggled field", () => {
    const { result } = renderHook(
      () => ({
        groundTruth: useFieldBoxes("ground_truth"),
        predictions: useFieldBoxes("predictions"),
      }),
      { wrapper: wrapper() },
    );

    act(() => result.current.groundTruth.toggle());
    expect(result.current.groundTruth.isShown).toBe(false);
    expect(result.current.predictions.isShown).toBe(true);
  });

  it("persists hidden fields per dataset in localStorage", () => {
    const { result } = renderHook(() => useFieldBoxes("ground_truth"), {
      wrapper: wrapper(),
    });

    act(() => result.current.toggle());

    const stored = localStorage.getItem(storageKey(mocks.datasetId));
    expect(JSON.parse(stored ?? "null")).toEqual(["ground_truth"]);
  });

  it("restores hidden fields from localStorage", async () => {
    localStorage.setItem(
      storageKey(mocks.datasetId),
      JSON.stringify(["ground_truth"]),
    );

    const { result } = renderHook(
      () => useBoundingBoxVisibility("ground_truth"),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current).toBe(false));
  });
});
