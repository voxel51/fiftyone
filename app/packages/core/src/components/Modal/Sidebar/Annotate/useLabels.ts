import { useAnnotationEngine } from "@fiftyone/annotation";
import {
  DetectionOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import {
  AnnotationLabel,
  AnnotationLabelData,
  isPatchesView,
  useModalSample,
} from "@fiftyone/state";
import { DETECTION, LabelType as EngineLabelType } from "@fiftyone/utilities";
import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { splitAtom, useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import type { LabelType } from "./Edit/state";
import {
  isFieldReadOnly,
  labelSchemasData,
  visibleLabelSchemas,
} from "./state";
import { useSetActiveLabelId } from "./useAnnotationContextManager";
import useHover from "./useHover";

export const addLabel = atom(
  undefined,
  (get, set, newLabel: AnnotationLabel) => {
    const existingLabels = get(labels);
    const alreadyHaveIt = existingLabels.some(
      (label) => label.overlay.id === newLabel.overlay.id
    );

    if (!alreadyHaveIt) {
      const newList = [...existingLabels, newLabel];

      set(labels, newList.sort(byLabelName));
    }
  }
);

export const labels = atom<Array<AnnotationLabel>>([]);
export const labelAtoms = splitAtom(labels, ({ overlay }) => overlay.id);
export const labelsByPath = atom((get) => {
  const map: Record<string, AnnotationLabel[]> = {};
  for (const label of get(labels)) {
    if (!label.path) {
      continue;
    }

    if (!map[label.path]) {
      map[label.path] = [];
    }

    map[label.path].push(label);
  }

  return map;
});

export const labelMap = atom((get) => {
  const atoms = get(labelAtoms);
  return Object.fromEntries(atoms.map((atom) => [get(atom).overlay.id, atom]));
});

export enum LabelsState {
  UNSET = "unset",
  LOADING = "loading",
  COMPLETE = "complete",
}
export const labelsState = atom<LabelsState>(LabelsState.UNSET);

/**
 * Returns a callback that updates the {@link AnnotationLabelData} for a label
 * identified by its overlay ID.
 *
 * The callback looks up the label's individual atom in the {@link labelMap},
 * replaces its `data` field, and returns whether the update succeeded.
 *
 * @returns A callback with signature
 *   `(id: string, data: AnnotationLabelData) => boolean` that returns `true`
 *   if the label was found and updated, or `false` if no label with the given
 *   ID exists.
 */
const useUpdateLabelAtom = () => {
  return useAtomCallback(
    useCallback((get, set, id: string, data: AnnotationLabelData): boolean => {
      const labelMapValue = get(labelMap);
      const targetAtom = labelMapValue[id];

      if (targetAtom) {
        const currentValue = get(targetAtom);
        set(targetAtom, { ...currentValue, data });
        return true;
      }

      return false;
    }, [])
  );
};

/**
 * Public API for interacting with current labels context.
 */
export interface LabelsContext {
  /**
   * Add an annotation label to the annotation sidebar.
   *
   * @param label Label to add
   */
  addLabelToSidebar: (label: AnnotationLabel) => void;

  /**
   * Look up an annotation label by its `_id`.
   *
   * @param id The `_id` of the label to find
   * @returns The matching label, or `undefined`
   */
  getLabelById: (id: string) => AnnotationLabel | undefined;

  /**
   * Remove a label from the annotation sidebar.
   *
   * @param labelId ID of label to remove
   */
  removeLabelFromSidebar: (labelId: string) => void;

  /**
   * Update the label data for the specified label ID.
   *
   * @param labelId ID of label to update
   * @param data Label data
   */
  updateLabelData: (labelId: string, data: AnnotationLabelData) => void;
}

/**
 * Hook which returns a getter function for reading the current sidebar labels
 * imperatively.
 */
export const useGetSidebarLabels = () => {
  const store = getDefaultStore();
  return useCallback(() => store.get(labels), [store]);
};

/**
 * Hook which provides access to the current {@link LabelsContext}.
 */
export const useLabelsContext = (): LabelsContext => {
  const addLabelToSidebar = useSetAtom(addLabel);
  const updateLabelData = useUpdateLabelAtom();
  const setLabels = useSetAtom(labels);

  const getLabelById = useAtomCallback(
    useCallback(
      (get, _set, id: string) =>
        get(labels).find((label) => label.data._id === id),
      []
    )
  );

  const removeLabelFromSidebar = useCallback(
    (labelId: string) =>
      setLabels((prev) => prev.filter((label) => label.data._id !== labelId)),
    [setLabels]
  );

  return useMemo(
    () => ({
      addLabelToSidebar,
      getLabelById,
      removeLabelFromSidebar,
      updateLabelData,
    }),
    [addLabelToSidebar, getLabelById, removeLabelFromSidebar, updateLabelData]
  );
};

/**
 * Syncs overlay draggable/resizeable flags when label schema read-only state
 * changes (e.g. user toggles read-only in Schema Manager).
 */
const useSyncOverlayReadOnly = () => {
  const currentLabels = useAtomValue(labels);
  const schemas = useAtomValue(labelSchemasData);

  useEffect(() => {
    if (!schemas) return;

    for (const label of currentLabels) {
      if (label.type !== DETECTION) continue;

      const overlay = label.overlay;
      if (!(overlay instanceof DetectionOverlay)) continue;

      const readOnly = isFieldReadOnly(schemas[label.path]);
      overlay.setDraggable(!readOnly);
      overlay.setResizeable(!readOnly);
    }
  }, [currentLabels, schemas]);
};

const SINGULAR: Partial<Record<EngineLabelType, LabelType>> = {
  [EngineLabelType.Classification]: "Classification",
  [EngineLabelType.Classifications]: "Classification",
  [EngineLabelType.Detection]: "Detection",
  [EngineLabelType.Detections]: "Detection",
  [EngineLabelType.Keypoint]: "Keypoint",
  [EngineLabelType.Keypoints]: "Keypoint",
  [EngineLabelType.Polyline]: "Polyline",
  [EngineLabelType.Polylines]: "Polyline",
};

const byLabelName = (a: AnnotationLabel, b: AnnotationLabel) =>
  (a.data.label ?? "").localeCompare(b.data?.label ?? "");

const sameData = (a: AnnotationLabelData, b: AnnotationLabelData) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

const sameEntry = (a: AnnotationLabel, b: AnnotationLabel) =>
  a.overlay === b.overlay &&
  a.path === b.path &&
  a.type === b.type &&
  sameData(a.data, b.data);

/**
 * Transitional row shape for an engine label with no mounted Lighter overlay
 * (3D-shaped data, content-declined data, an in-flight gated mask decode):
 * enough overlay surface for list rendering — id (entry identity), field +
 * label (coloring). The same shape the 3D create path puts in rows; it dies
 * with the mirror when rows derive per-component by ref.
 */
const stubOverlay = (
  id: string,
  field: string,
  label: AnnotationLabelData
): AnnotationLabel["overlay"] =>
  ({ id, field, label } as unknown as AnnotationLabel["overlay"]);

/**
 * The sidebar label list, derived from the annotation engine (the engine is
 * the source of truth; the Lighter bridge owns overlay hydration). This is a
 * TRANSITIONAL mirror onto the legacy `labels` atom: rows keep their
 * `AnnotationLabel` shape (data + overlay handle) until the remaining
 * consumers (`Edit/state`, focus, 3D ops, agents) migrate to engine reads,
 * at which point the atoms delete and rows derive per-component by ref.
 *
 * EVERY in-scope engine label gets a row — the list never asks another
 * surface for permission. Rows carry the live Lighter overlay when the scene
 * has one and a {@link stubOverlay} otherwise (3D-shaped or content-declined
 * data, an in-flight gated mask decode). Rows the engine does NOT know pass
 * through untouched (uncommitted creates from un-migrated surfaces — 3D ops
 * add rows via {@link useLabelsContext}); once the engine learns a label, its
 * derived row wins, which is what makes duplicates structurally impossible.
 *
 * Re-derives on every engine display tick and on `lighter:overlay-added`
 * (gated mask mounts insert without an engine change — the stub upgrades to
 * the live overlay when the decode lands).
 */
export default function useLabels() {
  const engine = useAnnotationEngine();
  const { scene } = useLighter();
  const active = useAtomValue(visibleLabelSchemas);
  const modalSample = useModalSample();
  const isPatches = useRecoilValue(isPatchesView);
  const setActiveLabelId = useSetActiveLabelId();
  const setLoading = useSetAtom(labelsState);

  const sampleId = modalSample?.sample?._id;

  // ids the mirror derived on its last pass, and for which sample — a row
  // that WAS engine-derived and no longer is was deleted (drop it, don't
  // pass it through); a sample switch starts from an empty list
  const derivedIds = useRef<Set<string>>(new Set());
  const derivedFor = useRef<string | null>(null);

  const reconcile = useCallback(() => {
    if (!sampleId || !active) {
      return;
    }

    const store = getDefaultStore();
    const current = store.get(labels);
    const previous = derivedFor.current === sampleId ? current : [];
    const previousById = new Map(previous.map((l) => [l.data._id, l]));
    const engineIds = new Set<string>();
    const next: AnnotationLabel[] = [];

    for (const path of active) {
      const type = SINGULAR[engine.getLabelType(path)];

      if (!type) {
        continue;
      }

      for (const data of engine.listLabels({ sample: sampleId, path })) {
        engineIds.add(data._id);

        const prev = previousById.get(data._id);
        const mounted = scene?.getOverlay(data._id);
        const live = mounted && mounted.field === path ? mounted : undefined;

        // keep stub identity across reconciles while the data is unchanged;
        // a data change rebuilds the stub so its label never goes stale
        const overlay = (live ??
          (prev && sameData(prev.data, data as AnnotationLabelData)
            ? prev.overlay
            : stubOverlay(
                data._id,
                path,
                data as AnnotationLabelData
              ))) as AnnotationLabel["overlay"];

        const entry: AnnotationLabel = {
          data: data as AnnotationLabelData,
          overlay,
          path,
          type,
        };
        next.push(prev && sameEntry(prev, entry) ? prev : entry);
      }
    }

    // engine-unknown rows pass through (uncommitted creates from
    // un-migrated surfaces) — unless the engine knew them last pass
    // (deleted: the row must not resurrect)
    for (const label of previous) {
      if (
        !engineIds.has(label.data._id) &&
        !derivedIds.current.has(label.data._id)
      ) {
        next.push(label);
      }
    }

    derivedIds.current = engineIds;
    derivedFor.current = sampleId;

    next.sort(byLabelName);

    const unchanged =
      next.length === current.length &&
      next.every((entry, index) => entry === current[index]);

    if (!unchanged) {
      store.set(labels, next);
    }
  }, [active, engine, sampleId, scene]);

  // first hydration per sample: loading gate + patches single-label auto-edit
  const completedFor = useRef<string | null>(null);

  useEffect(() => {
    if (completedFor.current !== sampleId) {
      completedFor.current = null;
      setLoading(sampleId ? LabelsState.LOADING : LabelsState.UNSET);
    }
  }, [sampleId, setLoading]);

  useEffect(() => {
    reconcile();

    if (completedFor.current !== sampleId && sampleId && active && scene) {
      completedFor.current = sampleId;
      setLoading(LabelsState.COMPLETE);

      if (isPatches) {
        // count from the engine, not the mirror — a gated overlay hasn't
        // mounted yet but still makes the patch single-label
        const all = active.flatMap((path) =>
          SINGULAR[engine.getLabelType(path)]
            ? engine.listLabels({ sample: sampleId, path })
            : []
        );

        if (all.length === 1) {
          setActiveLabelId(all[0]._id);
        }
      }
    }

    return engine.subscribe(reconcile);
  }, [
    active,
    engine,
    isPatches,
    reconcile,
    sampleId,
    scene,
    setActiveLabelId,
    setLoading,
  ]);

  // gated mounts insert without an engine change
  const on = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  on(
    "lighter:overlay-added",
    useCallback(() => reconcile(), [reconcile])
  );

  useSyncOverlayReadOnly();
  useHover();
}
