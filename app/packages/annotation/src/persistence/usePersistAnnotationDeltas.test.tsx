import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferred,
  flush,
  LOADED_SAMPLE,
  makeEngine,
  SAMPLE_ID,
  serverSample,
  T0_TOKEN,
  T1,
  T2,
  type TestEngine,
} from "./persistTestHarness";

let engine: TestEngine;
const refreshSample = vi.fn();
// generated-view state, switchable per test
let generatedView = false;
let supplied: { deltas: unknown[]; metadata: unknown } = {
  deltas: [],
  metadata: null,
};

vi.mock("@fiftyone/state", () => ({
  isGeneratedView: "isGeneratedView",
  generatedDatasetName: "generatedDatasetName",
  nullableModalSampleId: "nullableModalSampleId",
  // the same object on every render: the token closure never sees a refresh
  useActiveModalSample: () => LOADED_SAMPLE,
  useCurrentDatasetId: () => "dataset-1",
  useModalSample: () => ({ sample: LOADED_SAMPLE }),
  useRefreshSample: () => refreshSample,
  useStableInteraction3dSample: () => undefined,
}));

vi.mock("recoil", () => ({
  useRecoilValue: (key: string) =>
    key === "isGeneratedView" ? generatedView : undefined,
}));

vi.mock("./useAnnotationDeltaSupplier", () => ({
  useAnnotationDeltaSupplier: () => () => supplied,
}));

vi.mock("../state", () => ({
  useAnnotationEngine: () => engine,
  useThreeDSceneSampleId: () => undefined,
}));

// keep the real patch + token hooks; only the event bus is stubbed
vi.mock("../hooks", async () => {
  const patch = await import("../hooks/usePatchSample");
  const token = await import("../hooks/useGetVersionToken");

  return {
    useAnnotationEventBus: () => ({ dispatch: vi.fn() }),
    useGetVersionTokenWith: token.useGetVersionTokenWith,
    usePatchSample: patch.usePatchSample,
    usePatchSampleWith: patch.usePatchSampleWith,
  };
});

vi.mock("@fiftyone/core/src/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  patchSample: vi.fn(),
}));

import { patchSample, VersionMismatchError } from "@fiftyone/core/src/client";
import { clearSampleVersions } from "../util/sampleVersionTokens";
import { usePersistAnnotationDeltas } from "./usePersistAnnotationDeltas";

type PatchResponse = Awaited<ReturnType<typeof patchSample>>;

const A = { op: "replace", path: "/a", value: 1 } as const;
const B = { op: "replace", path: "/b", value: 2 } as const;

const patchCalls = () => vi.mocked(patchSample).mock.calls.map((c) => c[0]);

describe("usePersistAnnotationDeltas", () => {
  beforeEach(() => {
    vi.mocked(patchSample).mockReset();
    refreshSample.mockReset();
    clearSampleVersions();
    engine = makeEngine();
    generatedView = false;
    supplied = { deltas: [], metadata: null };
  });

  it("serializes independent hook instances (autosave and a delete's flush) per engine", async () => {
    const first = deferred<PatchResponse>();
    vi.mocked(patchSample)
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({
        sample: serverSample(T2) as never,
        versionToken: "etag-T2",
      });

    // two callers, two hook instances — as the autosave tick and useDeleteX
    const autosave = renderHook(() => usePersistAnnotationDeltas()).result
      .current;
    const flushDelete = renderHook(() => usePersistAnnotationDeltas()).result
      .current;

    engine.stage(A);
    const p1 = autosave();
    await flush();

    // request 1 is out, under the loaded sample's token
    expect(patchCalls()).toHaveLength(1);
    expect(patchCalls()[0].versionToken).toBe(T0_TOKEN);
    expect(patchCalls()[0].deltas).toEqual([A]);

    // an edit lands while request 1 is in flight, and a second caller flushes
    engine.stage(B);
    const p2 = flushDelete();
    await flush();

    // request 2 has not read the engine or been sent
    expect(engine.getJsonPatch).toHaveBeenCalledTimes(1);
    expect(patchCalls()).toHaveLength(1);

    first.resolve({
      sample: serverSample(T1) as never,
      versionToken: "etag-T1",
    });
    expect(await p1).toBe(true);
    expect(await p2).toBe(true);

    // request 2 started after request 1 reconciled: it carries the server's
    // T1 ETag — not the T0 token still held by the render closure — and only
    // the edit made during request 1
    expect(patchCalls()).toHaveLength(2);
    expect(patchCalls()[1].versionToken).toBe("etag-T1");
    expect(patchCalls()[1].deltas).toEqual([B]);
    expect(engine.reconcilePersisted.mock.invocationCallOrder[0]).toBeLessThan(
      engine.getJsonPatch.mock.invocationCallOrder[1],
    );
  });

  it("a 412 records the server's current ETag, and the queued persist sends it", async () => {
    vi.mocked(patchSample)
      .mockRejectedValueOnce(
        new VersionMismatchError(
          "Invalid version token",
          serverSample(T1),
          "etag-T1",
        ),
      )
      .mockResolvedValueOnce({
        sample: serverSample(T2) as never,
        versionToken: "etag-T2",
      });

    const persist = renderHook(() => usePersistAnnotationDeltas()).result
      .current;

    engine.stage(A);
    // the caller's failure handling: drop the edit the server refused
    const onFailure = vi.fn(() => engine.discard(A));
    const p1 = persist({ onFailure });
    await flush();

    engine.stage(B);
    const p2 = persist();

    await expect(p1).rejects.toBeInstanceOf(VersionMismatchError);
    expect(await p2).toBe(true);

    // request 1's failure handling ran before request 2 read the engine, so
    // request 2 carries only B, under the ETag the 412 returned
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.invocationCallOrder[0]).toBeLessThan(
      engine.getJsonPatch.mock.invocationCallOrder[1],
    );
    expect(patchCalls()[1].versionToken).toBe("etag-T1");
    expect(patchCalls()[1].deltas).toEqual([B]);
  });

  it("does not report failure (or roll back) when only the local refresh fails after the server applied the patch", async () => {
    vi.mocked(patchSample).mockResolvedValue({
      sample: serverSample(T1) as never,
      versionToken: "etag-T1",
    });
    refreshSample.mockImplementationOnce(() => {
      throw new Error("refresh failed");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const persist = renderHook(() => usePersistAnnotationDeltas()).result
      .current;
    const onFailure = vi.fn();

    engine.stage(A);

    // the server deleted the label; restoring it locally would diverge
    expect(await persist({ onFailure })).toBe(true);
    expect(onFailure).not.toHaveBeenCalled();
    expect(engine.reconcilePersisted).toHaveBeenCalledTimes(1);
    // the server's version was still recorded for the next persist
    engine.stage(B);
    await persist();
    expect(patchCalls()[1].versionToken).toBe("etag-T1");
    consoleError.mockRestore();
  });

  it("runs onFailure inside the queued unit when the persist reports failure without throwing", async () => {
    // the generated-view path reports `false` (no throw) when the label
    // metadata the backend needs is missing
    generatedView = true;
    supplied = { deltas: [A], metadata: null };
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const persist = renderHook(() => usePersistAnnotationDeltas()).result
      .current;
    const onFailure = vi.fn();

    expect(await persist({ onFailure })).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(patchSample).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("resolves null without a request when nothing is pending", async () => {
    const persist = renderHook(() => usePersistAnnotationDeltas()).result
      .current;

    expect(await persist()).toBeNull();
    expect(patchSample).not.toHaveBeenCalled();
  });

  it("a rejected persist does not block the next one", async () => {
    vi.mocked(patchSample)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        sample: serverSample(T1) as never,
        versionToken: "etag-T1",
      });
    const persist = renderHook(() => usePersistAnnotationDeltas()).result
      .current;

    engine.stage(A);
    await expect(persist()).rejects.toThrow("boom");
    expect(await persist()).toBe(true);
    expect(patchCalls()[1].deltas).toEqual([A]);
    expect(patchCalls()[1].sampleId).toBe(SAMPLE_ID);
  });
});
