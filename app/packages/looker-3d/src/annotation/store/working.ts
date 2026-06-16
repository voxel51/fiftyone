import * as fos from "@fiftyone/state";
import { isEqual } from "lodash";
import { useEffect, useRef } from "react";
import {
  atom,
  atomFamily,
  DefaultValue,
  selector,
  useRecoilCallback,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import type { OverlayLabel } from "../../labels/loader";
import {
  isDetection,
  isDetection3dOverlay,
  isPolyline,
  isPolyline3dOverlay,
} from "../../types";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";
import {
  roundDetection,
  roundPolyline,
  roundTuple,
} from "../utils/rounding-utils";
import { clearLastCreatedLabels } from "./labelResolution";
import type { LabelId, WorkingDoc, WorkingState } from "./types";

// =============================================================================
// WORKING STORE ATOMS
// =============================================================================

/**
 * Default empty working state.
 */
const defaultWorkingState: WorkingState = {
  doc: {
    labelsById: {},
    deletedIds: new Set(),
  },
  initialized: false,
};

/**
 * Atom family for working state, keyed by sampleId.
 * Each sample has its own independent working state.
 */
export const workingAtomFamily = atomFamily<WorkingState, string>({
  key: "fo3d-workingStore",
  default: defaultWorkingState,
});

/**
 * The 3D scene's stable, non-suspending sample id, mirrored into a synchronous
 * atom. The working store always holds the SCENE's labels, but the scene's own
 * id differs from `currentSampleId` in a grouped modal (the selected 2D slice
 * vs. the pinned 3D scene). The facade must key by the scene id so every
 * consumer — seed, render, the engine bridge — agrees on one family entry.
 *
 * Mirrored rather than read directly: the underlying `sceneSample` selector is
 * async, and keying this synchronous facade off it would suspend the working
 * store and hang the 3D render on "Pixelating…". {@link useBindStableSceneSampleId}
 * (mounted with the annotation bridge) feeds the last settled value here;
 * `undefined` outside an active 3D annotation session, where the facade falls
 * back to `currentSampleId` (non-grouped: the two coincide anyway).
 */
const stableSceneSampleIdAtom = atom<string | undefined>({
  key: "fo3d-stableSceneSampleId",
  default: undefined,
});

/**
 * Public facade selector for the working state of the active 3D scene, keyed by
 * the stable scene id (falling back to `currentSampleId` when no scene is
 * bound).
 */
export const workingAtom = selector<WorkingState>({
  key: "fo3d-workingStoreFacade",
  get: ({ get }) => {
    const sampleId = get(stableSceneSampleIdAtom) ?? get(fos.currentSampleId);
    if (!sampleId) {
      return defaultWorkingState;
    }
    return get(workingAtomFamily(sampleId));
  },
  set: ({ get, set }, newValue) => {
    const sampleId = get(stableSceneSampleIdAtom) ?? get(fos.currentSampleId);
    if (!sampleId || newValue instanceof DefaultValue) {
      return;
    }
    set(workingAtomFamily(sampleId), newValue);
  },
});

/**
 * Mirror the stable scene sample id into {@link stableSceneSampleIdAtom} so the
 * working-store facade keys off the scene, not the selected slice. Mount with
 * the annotation bridge (not the 3D viewer) so the binding outlives the
 * viewer's visibility; resets on unmount.
 */
export function useBindStableSceneSampleId(): void {
  const setSceneId = useSetRecoilState(stableSceneSampleIdAtom);
  const sceneId = fos.useStableSceneSample3d()?.sample?._id;

  useEffect(() => {
    setSceneId(sceneId);
    return () => setSceneId(undefined);
  }, [sceneId, setSceneId]);
}

/**
 * Selector that returns just the working document for the current sample.
 */
export const workingDocSelector = selector<WorkingDoc>({
  key: "fo3d-workingDocSelector",
  get: ({ get }) => {
    return get(workingAtom).doc;
  },
});

// =============================================================================
// INITIALIZATION HOOKS
// =============================================================================

/**
 * Converts raw overlays to a labelsById map for the working store.
 */
function mapOverlaysToLabelId(
  overlays: OverlayLabel[]
): Record<LabelId, ReconciledDetection3D | ReconciledPolyline3D> {
  const labelsById: Record<
    LabelId,
    ReconciledDetection3D | ReconciledPolyline3D
  > = {};

  for (const overlay of overlays) {
    if (isDetection3dOverlay(overlay)) {
      const detection: ReconciledDetection3D = {
        ...overlay,
      };
      labelsById[overlay._id] = roundDetection(detection);
    } else if (isPolyline3dOverlay(overlay)) {
      const polyline: ReconciledPolyline3D = {
        ...overlay,
        filled: !!overlay.filled,
        closed: !!overlay.closed,
      };
      labelsById[overlay._id] = roundPolyline(polyline);
    }
  }

  return labelsById;
}

/**
 * Hook that initializes the working store from baseline raw overlays and
 * patches it whenever rawOverlays gets a new reference (like coloring,
 * annotation schema, path filter, etc).
 *
 * @param rawOverlays - The baseline raw overlays derived from modalSample
 */
export function useInitializeWorking(rawOverlays: OverlayLabel[]) {
  const setWorking = useSetRecoilState(workingAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const workingState = useRecoilValue(workingAtom);
  const mode = fos.useModalMode();

  // This effect initializes working store from overlays when entering annotate mode
  useEffect(() => {
    if (
      mode !== fos.ModalMode.ANNOTATE ||
      !currentSampleId ||
      workingState.initialized
    ) {
      return;
    }

    const labelsById = mapOverlaysToLabelId(rawOverlays);

    setWorking({
      doc: {
        labelsById,
        deletedIds: new Set(),
      },
      initialized: true,
    });
  }, [mode, currentSampleId, rawOverlays, workingState.initialized]);

  const prevRawRef = useRef(rawOverlays);

  // Patches the working store whenever rawOverlays changes (e.g. coloring,
  // annotation schema, path filter, etc.)
  const patchWorking = useRecoilCallback(
    ({ snapshot, set }) =>
      (overlays: OverlayLabel[]) => {
        const state = snapshot.getLoadable(workingAtom).getValue();

        if (!state.initialized) return;

        const rawById = new Map<string, OverlayLabel>();

        for (const o of overlays) {
          rawById.set(o._id, o);
        }

        const prev = state.doc.labelsById;

        // Lazily shallow-copy `prev` on first mutation so we avoid
        // allocating when nothing actually changed.
        let next: Record<
          LabelId,
          ReconciledDetection3D | ReconciledPolyline3D
        > | null = null;
        let changed = false;

        // --- Pass 1: walk existing working labels ---
        // For each label already in the working store, check whether the
        // fresh baseline still contains it and whether its color drifted.
        for (const [id, label] of Object.entries(prev)) {
          const raw = rawById.get(id);

          // Baseline no longer includes this label (e.g. annotationSchemas
          // contracted). User-created labels (isNew) are always kept.
          // Soft-deleted labels are also kept so their data survives for undo.
          if (!raw && !label.isNew && !state.doc.deletedIds.has(id)) {
            if (!next) next = { ...prev };
            delete next[id];
            changed = true;
            continue;
          }

          // Color drifted (e.g. coloring settings changed).
          // Only touch `color` — geometry fields are user edits and stay put.
          if (raw && raw.color !== label.color) {
            if (!next) next = { ...prev };
            next[id] = { ...label, color: raw.color };
            changed = true;
          }
        }

        // --- Pass 2: pick up labels that are new in the baseline ---
        // These appear when annotationSchemas expands to include a field
        // that wasn't there at init time.
        for (const overlay of overlays) {
          // Already in working — handled above
          if (prev[overlay._id]) continue;

          if (!next) next = { ...prev };

          if (isDetection3dOverlay(overlay)) {
            next[overlay._id] = roundDetection({
              ...overlay,
            });
          } else if (isPolyline3dOverlay(overlay)) {
            next[overlay._id] = roundPolyline({
              ...overlay,
              filled: !!overlay.filled,
              closed: !!overlay.closed,
            });
          }
          changed = true;
        }

        // Nothing mutated — skip the state write entirely
        if (!changed || !next) return;

        set(workingAtom, {
          ...state,
          doc: { labelsById: next, deletedIds: state.doc.deletedIds },
        });
      },
    []
  );

  // Patch the working store whenever rawOverlays changes
  useEffect(() => {
    if (isEqual(prevRawRef.current, rawOverlays)) return;
    prevRawRef.current = rawOverlays;
    patchWorking(rawOverlays);
  }, [rawOverlays, patchWorking]);
}

/**
 * Hook that resets the working store when leaving annotate mode.
 */
export function useResetWorkingOnModeChange() {
  const mode = fos.useModalMode();
  const setWorking = useSetRecoilState(workingAtom);

  useEffect(() => {
    if (mode !== fos.ModalMode.ANNOTATE) {
      setWorking(defaultWorkingState);
      clearLastCreatedLabels();
    }
  }, [mode, setWorking]);
}

// =============================================================================
// ACCESSOR HOOKS
// =============================================================================

/**
 * Hook that returns the working document.
 */
export function useWorkingDoc(): WorkingDoc {
  return useRecoilValue(workingDocSelector);
}

/**
 * Hook that returns a specific label from the working store.
 */
export function useWorkingLabel(
  labelId: LabelId
): ReconciledDetection3D | ReconciledPolyline3D | undefined {
  const doc = useWorkingDoc();
  return doc.labelsById[labelId];
}

/**
 * Hook that returns whether a label has been deleted.
 */
export function useIsLabelDeleted(labelId: LabelId): boolean {
  const doc = useWorkingDoc();
  return doc.deletedIds.has(labelId);
}

/**
 * Hook that returns all detections from the working store.
 */
export function useWorkingDetections(): ReconciledDetection3D[] {
  const doc = useWorkingDoc();
  return Object.values(doc.labelsById).filter(
    (label): label is ReconciledDetection3D =>
      isDetection(label) && !doc.deletedIds.has(label._id)
  );
}

/**
 * Hook that returns all polylines from the working store.
 */
export function useWorkingPolylines(): ReconciledPolyline3D[] {
  const doc = useWorkingDoc();
  return Object.values(doc.labelsById).filter(
    (label): label is ReconciledPolyline3D =>
      isPolyline(label) && !doc.deletedIds.has(label._id)
  );
}

/**
 * Hook that returns all deleted labels from the working store.
 */
export function useDeletedWorkingLabels(): (
  | ReconciledDetection3D
  | ReconciledPolyline3D
)[] {
  const doc = useWorkingDoc();
  const deletedLabels: (ReconciledDetection3D | ReconciledPolyline3D)[] = [];

  doc.deletedIds.forEach((deletedId) => {
    const label = doc.labelsById[deletedId];
    if (label) {
      deletedLabels.push(label);
    }
  });

  return deletedLabels;
}

// =============================================================================
// CALLBACK HOOKS FOR OPERATIONS
// =============================================================================

/**
 * Hook that returns a callback to update a label in the working store.
 */
export function useUpdateWorkingLabel() {
  return useRecoilCallback(
    ({ set }) =>
      (
        labelId: LabelId,
        updates: Partial<ReconciledDetection3D> | Partial<ReconciledPolyline3D>
      ) => {
        set(workingAtom, (prev): WorkingState => {
          const existingLabel = prev.doc.labelsById[labelId];

          if (!existingLabel) {
            return prev;
          }

          // Round numeric values for consistency
          const roundedUpdates: Record<string, unknown> = { ...updates };

          if (isDetection(existingLabel)) {
            const detectionUpdates = updates as Partial<ReconciledDetection3D>;
            if (detectionUpdates.location) {
              roundedUpdates.location = roundTuple(detectionUpdates.location);
            }
            if (detectionUpdates.dimensions) {
              roundedUpdates.dimensions = roundTuple(
                detectionUpdates.dimensions
              );
            }
            if (detectionUpdates.rotation) {
              roundedUpdates.rotation = roundTuple(detectionUpdates.rotation);
            }
            if (detectionUpdates.quaternion) {
              roundedUpdates.quaternion = roundTuple(
                detectionUpdates.quaternion
              );
            }
          } else if (isPolyline(existingLabel)) {
            const polylineUpdates = updates as Partial<ReconciledPolyline3D>;
            if (polylineUpdates.points3d) {
              roundedUpdates.points3d = polylineUpdates.points3d.map(
                (segment) =>
                  segment.map(
                    (point) => roundTuple(point) as [number, number, number]
                  )
              );
            }
          }

          const updatedLabel = {
            ...existingLabel,
            ...roundedUpdates,
          } as ReconciledDetection3D | ReconciledPolyline3D;

          return {
            ...prev,
            doc: {
              ...prev.doc,
              labelsById: {
                ...prev.doc.labelsById,
                [labelId]: updatedLabel,
              },
            },
          };
        });
      },
    []
  );
}

/**
 * Hook that returns a callback to add a new label to the working store.
 */
export function useAddWorkingLabel() {
  return useRecoilCallback(
    ({ set }) =>
      (label: ReconciledDetection3D | ReconciledPolyline3D) => {
        const roundedLabel = isDetection(label)
          ? roundDetection(label)
          : roundPolyline(label);

        set(workingAtom, (prev) => {
          // Remove from deletedIds if present
          const newDeletedIds = new Set(prev.doc.deletedIds);
          newDeletedIds.delete(roundedLabel._id);

          return {
            ...prev,
            doc: {
              ...prev.doc,
              labelsById: {
                ...prev.doc.labelsById,
                [roundedLabel._id]: roundedLabel,
              },
              deletedIds: newDeletedIds,
            },
          };
        });
      },
    []
  );
}

/**
 * Hook that returns a callback to HARD-remove a label from the working store
 * (drops it from `labelsById` and `deletedIds` both). This is the engine
 * bridge's `unmount`: when a label leaves the engine's scope (a delete, or a
 * scope contraction), its working entry goes too.
 */
export function useRemoveWorkingLabel() {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      (labelId: LabelId) => {
        // Resolve the scene key from the sync atom and write the family entry
        // directly — NOT the facade. The facade's `currentSampleId` fallback is
        // async on a grouped pcd slice, and a functional-updater set against it
        // throws while it is pending (the bridge unmount lands here during modal
        // teardown, after the scene id resets). No scene key = nothing to remove.
        const sampleId = snapshot
          .getLoadable(stableSceneSampleIdAtom)
          .getValue();

        if (!sampleId) {
          return;
        }

        const prev = snapshot
          .getLoadable(workingAtomFamily(sampleId))
          .getValue();

        if (!prev.doc.labelsById[labelId]) {
          return;
        }

        const labelsById = { ...prev.doc.labelsById };
        delete labelsById[labelId];

        const deletedIds = new Set(prev.doc.deletedIds);
        deletedIds.delete(labelId);

        set(workingAtomFamily(sampleId), {
          ...prev,
          doc: { ...prev.doc, labelsById, deletedIds },
        });
      },
    []
  );
}
