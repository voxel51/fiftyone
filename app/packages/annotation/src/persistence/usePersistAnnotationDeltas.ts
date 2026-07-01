import {
  isGeneratedView,
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
 * Hook which provides a callback to persist all pending annotation deltas.
 *
 * A grouped modal renders more than one sample at once (the selected slice and
 * the pinned 3D scene), each its own engine store. The engine emits one patch
 * per dirty sample, and each is written through a binding keyed to that sample
 * (its own version token + refresh). Generated (patches) views are
 * single-sample and carry label metadata, so they keep their own path.
 *
 * @returns A callback that persists annotation deltas and returns:
 *   - `true` if persistence was successful
 *   - `false` if persistence was unsuccessful
 *   - `null` if no changes were pending
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

    return useCallback(async () => {
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
          engine.reconcilePersisted([{ sample: modalId, deltas }]);
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

<<<<<<< HEAD
      if (isGenerated) {
        if (!metadata) {
          console.warn(
            "Generated view persistence requires label metadata but none was provided.",
            { deltaCount: deltas.length, deltas },
          );
          return false;
        }
=======
      // snapshot the pre-persist transient so the reconcile after each await
      // keeps any field edited while the patch is in flight
      engine.captureBaseline();
>>>>>>> main

      let success = true;
      for (const entry of patches) {
        const patch = entry.sample === sceneId ? patch3d : patchSelected;

        const ok = await patch(entry.deltas);

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
      engine,
      eventBus,
      isGenerated,
      modalId,
      patch3d,
      patchSelected,
      sceneId,
      supplyAnnotationDeltas,
    ]);
  };
