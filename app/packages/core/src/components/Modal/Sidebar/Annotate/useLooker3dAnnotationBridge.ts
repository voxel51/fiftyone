import {
  useAnnotationEngine,
  useLooker3dEngineBridge,
  useRegisterLooker3dSurfaceController,
  useSceneSampleId,
  type WorkingStore3d,
} from "@fiftyone/annotation";
import {
  useAddWorkingLabel,
  useBindStableSceneSampleId,
  useRemoveWorkingLabel,
  useUpdateWorkingLabel,
  useWorkingDoc,
} from "@fiftyone/looker-3d";
import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";
import { visibleLabelSchemas } from "./state";

/**
 * Mount the looker-3d surface on the annotation engine: the bridge owns the
 * READ-HALF — the engine reconciles Sample edits (sidebar form, undo,
 * persistence) into the 3D working store, replacing `useSync3dSample`'s
 * bespoke `subscribeChanges` reconcile. Scoped to the active schema paths
 * (the `renders` adapters keep 2D labels out); keyed by the SCENE's stable
 * sample id so a grouped modal's 3D labels never land on the selected 2D slice.
 *
 * The working store is the surface's "scene": the injected {@link WorkingStore3d}
 * is its Recoil binding. Mount once at the annotation root, after
 * `useSyncAnnotationEngine`.
 *
 * Transitional: the WRITE-half (working store → Sample) is still
 * `useSync3dSample`; `operations.ts` migrates onto the controller next.
 */
export const useLooker3dAnnotationBridge = (): void => {
  // bind the scene id into the working-store facade key BEFORE anything reads
  // it — the bridge and the 3D render must agree on one family entry
  useBindStableSceneSampleId();

  const engine = useAnnotationEngine();
  const sampleId = useSceneSampleId() ?? "";
  const active = useAtomValue(visibleLabelSchemas);

  // key the scope set on content so renders don't re-create the bridge
  const pathsKey = active ? [...active].sort().join(" ") : "";
  const paths = useMemo(
    () => new Set(pathsKey ? pathsKey.split(" ") : []),
    [pathsKey]
  );

  // store.get reads the latest doc without re-creating the (stable) store —
  // the recoil mutators are useRecoilCallback-stable, the doc rides a ref
  const doc = useWorkingDoc();
  const docRef = useRef(doc);
  docRef.current = doc;

  const add = useAddWorkingLabel();
  const update = useUpdateWorkingLabel();
  const remove = useRemoveWorkingLabel();

  const store = useMemo<WorkingStore3d>(
    () => ({
      get: (id) => docRef.current.labelsById[id],
      add,
      update,
      // The working store owns 3D deletes (soft-delete + ad-hoc `restoreLabel`
      // undo): a tombstoned entry must survive the Sample delete the write-half
      // mirrors out, or undo has nothing to restore into the scene. Genuine
      // engine-scope exits (not soft-deleted) still hard-remove. Transitional —
      // dissolves when 3D delete commits through the engine with value-based undo.
      remove: (id) => {
        if (docRef.current.deletedIds.has(id)) {
          return;
        }

        remove(id);
      },
    }),
    [add, update, remove]
  );

  const controller = useLooker3dEngineBridge({
    engine,
    sample: sampleId,
    paths,
    store,
  });

  // expose the controller to the 3D surface's own gesture operations
  // (`operations.ts`) so create/update/delete commit through the engine. Null
  // while the scene id is unsettled — the controller is the throwing
  // not-ready stub then, and the write-half no-ops until it settles.
  useRegisterLooker3dSurfaceController(sampleId ? controller : null);
};
