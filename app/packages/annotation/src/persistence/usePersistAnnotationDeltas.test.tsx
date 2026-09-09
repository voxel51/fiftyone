import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/state", () => ({
  isGeneratedView: "isGeneratedView",
  nullableModalSampleId: "nullableModalSampleId",
  useCurrentDatasetId: () => "dataset-1",
  useModalSample: () => ({ sample: { _id: "sample-1" } }),
  useRefreshSample: () => vi.fn(),
  useStableInteraction3dSample: () => undefined,
}));

vi.mock("recoil", () => ({
  useRecoilValue: (key: string) =>
    key === "isGeneratedView" ? false : undefined,
}));

vi.mock("./useAnnotationDeltaSupplier", () => ({
  useAnnotationDeltaSupplier: () => () => ({ deltas: [], metadata: null }),
}));

const patchSelected = vi.fn();

vi.mock("../hooks", () => ({
  useAnnotationEventBus: () => ({ dispatch: vi.fn() }),
  useGetVersionTokenWith: () => () => "token",
  usePatchSample: () => patchSelected,
  usePatchSampleWith: () => vi.fn(),
}));

const engine = {
  getJsonPatch: vi.fn(),
  captureBaseline: vi.fn(),
  reconcilePersisted: vi.fn(),
  getPersistenceAdapter: () => undefined,
};

vi.mock("../state", () => ({
  useAnnotationEngine: () => engine,
  useThreeDSceneSampleId: () => undefined,
}));

import { usePersistAnnotationDeltas } from "./usePersistAnnotationDeltas";

const DELTAS = [{ op: "replace", path: "/x", value: 1 }];

describe("usePersistAnnotationDeltas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engine.getJsonPatch.mockReturnValue([
      { sample: "sample-1", deltas: DELTAS },
    ]);
  });

  it("a second persist waits for the in-flight one before reading the engine", async () => {
    let finishFirst!: (ok: boolean) => void;
    patchSelected
      .mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (finishFirst = resolve)),
      )
      .mockResolvedValueOnce(true);

    const { result } = renderHook(() => usePersistAnnotationDeltas());

    const first = result.current();
    const second = result.current();
    await Promise.resolve();

    // the second call has not touched the engine while the first is in flight
    expect(engine.getJsonPatch).toHaveBeenCalledTimes(1);
    expect(patchSelected).toHaveBeenCalledTimes(1);

    finishFirst(true);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);

    // the first response was reconciled before the second read its deltas
    expect(engine.reconcilePersisted).toHaveBeenCalledTimes(2);
    expect(engine.getJsonPatch).toHaveBeenCalledTimes(2);
    expect(engine.reconcilePersisted.mock.invocationCallOrder[0]).toBeLessThan(
      engine.getJsonPatch.mock.invocationCallOrder[1],
    );
  });

  it("a rejected persist does not block the next one", async () => {
    patchSelected
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true);

    const { result } = renderHook(() => usePersistAnnotationDeltas());

    await expect(result.current()).rejects.toThrow("boom");
    await expect(result.current()).resolves.toBe(true);
  });
});
