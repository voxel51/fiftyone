import {
  isGeneratedView,
  nullableModalSampleId,
  useCurrentDatasetId,
  useModalSample,
  useRefreshSample,
  useStableInteraction3dSample,
} from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { useAnnotationDeltaSupplier } from "./useAnnotationDeltaSupplier";
import {
  useAnnotationEventBus,
  useGetVersionTokenWith,
  usePatchSample,
  usePatchSampleWith,
} from "../hooks";
import { useAnnotationEngine, useThreeDSceneSampleId } from "../state";

/**
 * @returns `true` if persistence was successful
 * @returns `false` if persistence was unsuccessful
 * @returns `null` if no changes were pending
 */
type PersistenceResult = boolean | null;

/**
 * The persist in flight per engine. Each persist waits for the previous one
 * so a second write never reads deltas and a version token the first has not
 * yet reconciled.
 */
const inFlight = new WeakMap<object, Promise<unknown>>();

/**
 * Hook which provides a callback to persist all pending annotation deltas.
 * Each dirty sample is written through its own binding (version token and
 * refresh); generated patches views keep their own path.
 *
 * @returns A callback resolving `true` on success, `false` on failure, `null`
 *   when nothing was pending
 */
export const usePersistAnnotationDeltas =
  (): (() => Promise<PersistenceResult>) => {
    const engine = useAnnotationEngine();
    const supplyAnnotationDeltas = useAnnotationDeltaSupplier();
    const patchSelected = usePatchSample();
    const eventBus = useAnnotationEventBus();
    const isGenerated = useRecoilValue(isGeneratedView);

    // the pinned 3D scene is a distinct sample; patch it through its own
    // binding (version token + refresh keyed to that sample). Inert unless a
    // grouped modal actually renders a separate 3D scene.
    //
    // STABLE (non-suspending) variant of the same 3D interaction sample: this
    // hook is now reached from the broad Lighter renderer path (useBridge →
    // useDeleteAnnotation), where the suspending `useInteraction3dSample` would
    // hang the modal on "Pixelating…". Until the 3D group query settles it reads
    // `undefined`, which matches `sceneId` below so the 3D branch stays inert.
    const modalId = useModalSample()?.sample?._id;
    // The task's unit of work: the GRID anchor sample id, stable across
    // group-slice and 3D-pin changes. Non-generated label ops attribute
    // to it so grouped-modal edits (the second camera, the pinned 3D
    // scene) reach the submit delta and the trail under the same key the
    // subtask, the delta peek, and the tracker focus already use.
    const anchorSampleId = useRecoilValue(nullableModalSampleId) ?? undefined;
    const sceneId = useThreeDSceneSampleId();
    const threeDScene = useStableInteraction3dSample();
    const patch3d = usePatchSampleWith({
      sample: threeDScene?.sample ?? null,
      datasetId: useCurrentDatasetId(),
      getVersionToken: useGetVersionTokenWith({
        sample: threeDScene?.sample ?? null,
      }),
      refreshSample: useRefreshSample(),
      isGenerated: false,
      generatedDatasetName: null,
    });

    const persist = useCallback(async (): Promise<PersistenceResult> => {
      // generated (patches) views are single-sample and route through
      // first-edited-label metadata, so the backend can find the source label
      if (isGenerated) {
        const { deltas, metadata } = supplyAnnotationDeltas();

        if (deltas.length === 0) {
          return null;
        }

        eventBus.dispatch("annotation:persistenceInFlight");

        if (!metadata) {
          console.warn(
            "Generated view persistence requires label metadata but none was provided.",
            { deltaCount: deltas.length, deltas },
          );
          return false;
        }

        // snapshot the pre-persist transient so the reconcile after the await
        // keeps any field edited while the patch is in flight
        engine.captureBaseline();

        const success = await patchSelected(deltas, {
          labelId: metadata.labelId,
          labelPath: metadata.labelPath,
          opType: "mutate",
        });

        if (success && modalId) {
          // Generated (patches) deltas are LABEL-rooted — the sample
          // source must not be rebased from them.
          engine.reconcilePersisted([{ sample: modalId, deltas }], {
            sampleRooted: false,
          });
        }

        return success;
      }

      // one patch per dirty sample the modal renders (selected slice + 3D).
      // A store can be dirty (transient entries present) yet diff to NOTHING
      // when a transient equals its source — that is not a save: patching []
      // succeeds with no network, so without this filter the autosave tick
      // would fire a spurious "saved" toast every interval.
      const patches = engine
        .getJsonPatch()
        .filter((entry) => entry.deltas.length > 0);

      if (patches.length === 0) {
        return null;
      }

      eventBus.dispatch("annotation:persistenceInFlight");

      // snapshot the pre-persist transient so the reconcile after each await
      // keeps any field edited while the patch is in flight
      engine.captureBaseline();

      let success = true;
      for (const entry of patches) {
        // a store with its own transport owns the write
        const patch =
          engine.getPersistenceAdapter(entry.sample) ??
          (entry.sample === sceneId ? patch3d : patchSelected);

        const ok = await patch(entry.deltas, {
          attributionSampleId: anchorSampleId,
        });

        if (ok) {
          // release server-owned fields (e.g. masks) the backend now owns, so
          // the frozen transient copy isn't re-emitted against the server's
          // re-encoded value on the next autosave tick
          engine.reconcilePersisted([entry]);
        } else {
          success = false;
        }
      }

      return success;
    }, [
      anchorSampleId,
      engine,
      eventBus,
      isGenerated,
      modalId,
      patch3d,
      patchSelected,
      sceneId,
      supplyAnnotationDeltas,
    ]);

    return useCallback(() => {
      const prior = inFlight.get(engine) ?? Promise.resolve();
      const run = prior.then(persist);
      inFlight.set(
        engine,
        run.catch(() => undefined),
      );

      return run;
    }, [engine, persist]);
  };
