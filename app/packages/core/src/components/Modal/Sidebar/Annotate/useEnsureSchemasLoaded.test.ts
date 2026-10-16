import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  datasetName: "a" as string | null,
  schemasData: null as object | null,
  fetch: vi.fn(),
  setActive: vi.fn(),
  setData: vi.fn(),
}));

vi.mock("@fiftyone/operators", () => ({
  useOperatorExecutor: vi.fn(() => ({})),
}));

vi.mock("@fiftyone/state", () => ({ datasetName: "datasetName" }));

vi.mock("recoil", () => ({
  useRecoilValue: vi.fn(() => mocks.datasetName),
}));

vi.mock("jotai", () => ({
  useAtomValue: vi.fn(() => mocks.schemasData),
  useSetAtom: vi.fn((atom) =>
    atom === "activeLabelSchemas" ? mocks.setActive : mocks.setData,
  ),
}));

vi.mock("./state", () => ({
  activeLabelSchemas: "activeLabelSchemas",
  labelSchemasData: "labelSchemasData",
}));

vi.mock("./useSchemaManager", () => ({
  operatorAsPromise: mocks.fetch,
}));

import { useEnsureSchemasLoaded } from "./useEnsureSchemasLoaded";

const RESULT = {
  label_schemas: { gt: { type: "detections" } },
  active_label_schemas: [],
};

const flush = () => act(async () => {});

describe("useEnsureSchemasLoaded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.datasetName = "a";
    mocks.schemasData = null;
    mocks.fetch.mockResolvedValue(RESULT);
  });

  it("fills empty atoms for the dataset", async () => {
    renderHook(() => useEnsureSchemasLoaded(true));
    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.setData).toHaveBeenCalledWith(RESULT.label_schemas);
    expect(mocks.setActive).toHaveBeenCalledWith([]);
  });

  it("does not refill atoms cleared on the same dataset", async () => {
    const { rerender } = renderHook(() => useEnsureSchemasLoaded(true));
    await flush();

    mocks.schemasData = RESULT.label_schemas;
    rerender();
    // annotation entry clears the atoms while it activates a field
    mocks.schemasData = null;
    rerender();
    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.setActive).toHaveBeenCalledTimes(1);
  });

  it("fetches again after a dataset switch", async () => {
    const { rerender } = renderHook(() => useEnsureSchemasLoaded(true));
    await flush();

    mocks.datasetName = "b";
    rerender();
    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries after a failed fetch", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("unavailable"));
    const { rerender } = renderHook(
      ({ enabled }) => useEnsureSchemasLoaded(enabled),
      { initialProps: { enabled: true } },
    );
    await flush();

    expect(mocks.setData).not.toHaveBeenCalled();

    rerender({ enabled: false });
    rerender({ enabled: true });
    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.setData).toHaveBeenCalledWith(RESULT.label_schemas);
  });
});
