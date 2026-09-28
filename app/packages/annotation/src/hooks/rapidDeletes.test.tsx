import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnotationLabel } from "@fiftyone/state";
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
} from "../persistence/persistTestHarness";

let engine: TestEngine;

// the delete hooks import their collaborators through the package entry;
// keep the real persist path and stub the rest
vi.mock("@fiftyone/annotation", async () => {
  const persistence = await import("../persistence/usePersistAnnotationDeltas");

  return {
    useActiveAnnotationSampleId: () => SAMPLE_ID,
    useAnnotationEngine: () => engine,
    useAnnotationEventBus: () => ({ dispatch: vi.fn() }),
    usePersistAnnotationDeltas: persistence.usePersistAnnotationDeltas,
  };
});

vi.mock("@fiftyone/state", () => ({
  isGeneratedView: "isGeneratedView",
  generatedDatasetName: "generatedDatasetName",
  nullableModalSampleId: "nullableModalSampleId",
  useActiveModalSample: () => LOADED_SAMPLE,
  useCurrentDatasetId: () => "dataset-1",
  useModalSample: () => ({ sample: LOADED_SAMPLE }),
  useRefreshSample: () => vi.fn(),
  useStableInteraction3dSample: () => undefined,
}));

vi.mock("recoil", () => ({
  useRecoilValue: (key: string) =>
    key === "isGeneratedView" ? false : undefined,
}));

vi.mock("../persistence/useAnnotationDeltaSupplier", () => ({
  useAnnotationDeltaSupplier: () => () => ({ deltas: [], metadata: null }),
}));

vi.mock("../state", () => ({
  useAnnotationEngine: () => engine,
  useThreeDSceneSampleId: () => undefined,
}));

vi.mock("./index", async () => {
  const patch = await import("./usePatchSample");
  const token = await import("./useGetVersionToken");

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
import { useDeleteAnnotation } from "./useDeleteAnnotation";
import { useDeleteTrack } from "./useDeleteTrack";

type PatchResponse = Awaited<ReturnType<typeof patchSample>>;

const patchCalls = () => vi.mocked(patchSample).mock.calls.map((c) => c[0]);

const makeLabel = (id: string, path = "detections"): AnnotationLabel =>
  ({
    type: "Detection",
    path,
    data: { _id: id, label: "car" },
  }) as unknown as AnnotationLabel;

const trackRef = (instanceId: string) => ({
  sample: SAMPLE_ID,
  path: "frames.detections",
  instanceId,
  frame: 1,
});

const removeOp = (path: string) => ({ op: "remove", path });

/** Two deletes in quick succession: the second lands while the first PATCH is in flight. */
const deleteTwo = async <T,>(
  run: (n: number) => Promise<T>,
  first: ReturnType<typeof deferred<PatchResponse>>,
) => {
  const d1 = run(1);
  await flush();
  expect(patchCalls()).toHaveLength(1);

  const d2 = run(2);
  await flush();
  // the second delete is queued, not sent
  expect(patchCalls()).toHaveLength(1);

  first.resolve({ sample: serverSample(T1) as never, versionToken: "etag-T1" });

  return [await d1, await d2] as const;
};

describe("rapid deletes", () => {
  beforeEach(() => {
    vi.mocked(patchSample).mockReset();
    clearSampleVersions();
    engine = makeEngine();
  });

  it("two rapid image-label deletes send two ordered PATCHes with advancing tokens", async () => {
    const first = deferred<PatchResponse>();
    vi.mocked(patchSample)
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({
        sample: serverSample(T2) as never,
        versionToken: "etag-T2",
      });
    const deleteAnnotation = renderHook(() => useDeleteAnnotation()).result
      .current;

    const results = await deleteTwo(
      (n) => deleteAnnotation(makeLabel(`label-${n}`)),
      first,
    );

    expect(results).toEqual([true, true]);
    expect(patchCalls()).toHaveLength(2);
    expect(patchCalls()[0].versionToken).toBe(T0_TOKEN);
    expect(patchCalls()[0].deltas).toEqual([removeOp("/detections/label-1")]);
    expect(patchCalls()[1].versionToken).toBe("etag-T1");
    expect(patchCalls()[1].deltas).toEqual([removeOp("/detections/label-2")]);
    expect(engine.rollbackEntry).not.toHaveBeenCalled();
    expect(engine.pending).toEqual([]);
  });

  it("two rapid track deletes send each track's frame removes in its own ordered PATCH", async () => {
    const first = deferred<PatchResponse>();
    vi.mocked(patchSample)
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({
        sample: serverSample(T2) as never,
        versionToken: "etag-T2",
      });
    const deleteTrack = renderHook(() => useDeleteTrack()).result.current;

    const results = await deleteTwo(
      (n) => deleteTrack(makeLabel(`doc-${n}`), trackRef(`track-${n}`)),
      first,
    );

    expect(results).toEqual([true, true]);
    expect(patchCalls()).toHaveLength(2);
    expect(patchCalls()[0].versionToken).toBe(T0_TOKEN);
    expect(patchCalls()[0].deltas).toEqual(
      [1, 2, 3].map((f) => removeOp(`/frames/${f}/frames/detections/track-1`)),
    );
    expect(patchCalls()[1].versionToken).toBe("etag-T1");
    expect(patchCalls()[1].deltas).toEqual(
      [1, 2, 3].map((f) => removeOp(`/frames/${f}/frames/detections/track-2`)),
    );
    expect(engine.rollbackEntry).not.toHaveBeenCalled();
  });

  it("a 412 on the first delete rolls it back before the queued delete reads the engine", async () => {
    const first = deferred<PatchResponse>();
    vi.mocked(patchSample)
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({
        sample: serverSample(T2) as never,
        versionToken: "etag-T2",
      });
    const deleteAnnotation = renderHook(() => useDeleteAnnotation()).result
      .current;

    const d1 = deleteAnnotation(makeLabel("label-1"));
    await flush();
    const d2 = deleteAnnotation(makeLabel("label-2"));
    await flush();

    first.reject(
      new VersionMismatchError(
        "Invalid version token",
        serverSample(T1),
        "etag-T1",
      ),
    );

    await expect(d1).rejects.toBeInstanceOf(VersionMismatchError);
    expect(await d2).toBe(true);

    // label-1 was restored (its remove dropped) before delete 2 read the
    // engine, so delete 2 carries only label-2 under the 412's current ETag
    expect(engine.rollbackEntry).toHaveBeenCalledTimes(1);
    expect(engine.rollbackEntry.mock.invocationCallOrder[0]).toBeLessThan(
      engine.getJsonPatch.mock.invocationCallOrder[1],
    );
    expect(patchCalls()[1].versionToken).toBe("etag-T1");
    expect(patchCalls()[1].deltas).toEqual([removeOp("/detections/label-2")]);
  });
});
