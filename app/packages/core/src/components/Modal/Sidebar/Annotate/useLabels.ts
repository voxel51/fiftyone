import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
} from "@fiftyone/annotation";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import {
  AnnotationLabel,
  AnnotationLabelData,
  isPatchesView,
} from "@fiftyone/state";
import { LabelType as EngineLabelType } from "@fiftyone/utilities";
import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { splitAtom, useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import type { LabelType } from "./Edit/useAnnotationContext";
import { activeLabelSchemas, visibleLabelSchemas } from "./state";
import { useSetEntranceLabel } from "./useAnnotationContextManager";

/**
<<<<<<< HEAD
 * Map from plural label _cls to the list key and singular LabelType.
 * Used to load labels from sample data when the field is not yet in the
 * Recoil schema (e.g. field just created via Schema Manager).
 */
const LABEL_LIST_INFO: Record<string, { listKey: string; type: LabelType }> = {
  Detections: { listKey: "detections", type: "Detection" },
  Classifications: { listKey: "classifications", type: "Classification" },
  Polylines: { listKey: "polylines", type: "Polyline" },
  Keypoints: { listKey: "keypoints", type: "Keypoint" },
};

/**
 * Pulls fulfilled values out of a `Promise.allSettled` batch and logs
 * rejected ones. Used so one bad label decode doesn't abort the entire
 * sample's label hydration.
 */
const collectFulfilled = <T>(
  results: PromiseSettledResult<T>[],
  context: string,
): T[] => {
  const values: T[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      values.push(result.value);
    } else {
      console.warn(
        `Skipping label in ${context}: failed to create annotation label`,
        result.reason,
      );
    }
  }

  return values;
};

/**
 * Builds a per-label URL resolver that maps sub-field names (e.g.
 * `"mask_path"`) to fetchable media URLs.
=======
 * The sidebar label list is ready to render once label schemas have been
 * fetched (`activeLabelSchemas` is non-null) AND there is an active annotation
 * sample to read from. This is the engine-readiness signal that replaces the
 * old `labelsState` loading gate: the list reads the engine directly, so its
 * gate keys on the engine's preconditions, not on a mirror-load lifecycle.
>>>>>>> main
 *
 * Schemas arrive asynchronously via `get_label_schemas`; requiring non-null
 * schemas keeps the gate from opening on a transient zero-result state.
 */
<<<<<<< HEAD
const buildLabelResolveUrl = (
  sources: { [key: string]: string },
  expandedPath: string,
  isList: boolean,
  idx: number,
  item: unknown,
): ((subField: string) => string | undefined) => {
  return (subField: string) => {
    const key = isList
      ? `${expandedPath}[${idx}].${subField}`
      : `${expandedPath}.${subField}`;

    // Resolve the raw value: sources[key] takes precedence (server-provided,
    // structurally keyed), falling back to the label's own sub-field.
    const raw = sources[key] ?? get(item, subField);
    if (typeof raw !== "string") {
      return undefined;
    }

    // `getSampleSrc` rewrites local-style paths into a `/media`-shaped URL
    // and returns URL-shaped values unchanged
    return getSampleSrc(raw);
  };
};

const handleSample = async ({
  createLabel,
  getFieldType,
  hasExistingOverlay,
  paths,
  sample,
  schemas,
}: {
  createLabel: ReturnType<typeof useCreateAnnotationLabel>;
  getFieldType: (path: string) => Promise<LabelType>;
  /**
   * Returns true if the scene already holds an overlay for the given
   * label id. Used to skip redundant `mask_path` decodes during refresh —
   * the existing overlay's mask is reused.
   */
  hasExistingOverlay: (id: string) => boolean;
  paths: { [key: string]: string };
  sample: ModalSample;
  schemas: string[];
}) => {
  const data = sample.sample;
  const sources = getNormalizedUrls(sample.urls ?? {});
  const labels: AnnotationLabel[] = [];

  for (const path in paths) {
    if (!schemas.includes(path)) {
      continue;
    }

    let type: LabelType;
    try {
      type = await getFieldType(paths[path]);
    } catch (error) {
      console.warn(
        `Skipping path "${path}": unable to resolve field type`,
        error,
      );

      continue;
    }
    const result = get(data, paths[path]);

    const isList = Array.isArray(result);
    const array = isList ? result : result ? [result] : [];
    const expandedPath = paths[path];

    const settled = await Promise.allSettled(
      array.map((item, idx) =>
        createLabel(path, type, item, {
          resolveUrl: buildLabelResolveUrl(
            sources,
            expandedPath,
            isList,
            idx,
            item,
          ),
          skipMaskDecode: hasExistingOverlay(
            (item as { _id?: string })?._id ?? "",
          ),
        }),
      ),
    );

    labels.push(...collectFulfilled(settled, `path "${path}"`));
  }

  // Process fields in activeLabelSchemas that aren't in Recoil's activeFields
  // (e.g. fields created via Schema Manager not yet in the Recoil schema cache)
  const KNOWN_SINGULAR_TYPES = new Set<string>([
    "Classification",
    "Detection",
    "Polyline",
    "Keypoint",
  ]);

  for (const schemaPath of schemas) {
    if (schemaPath in paths) continue;

    const fieldData = get(data, schemaPath);
    if (!fieldData || typeof fieldData !== "object") continue;

    const cls = (fieldData as Record<string, unknown>)?._cls as string;
    if (!cls) continue;

    const listInfo = LABEL_LIST_INFO[cls];
    if (listInfo) {
      const items = (fieldData as Record<string, unknown>)[
        listInfo.listKey
      ] as unknown[];

      if (Array.isArray(items)) {
        const expandedPath = `${schemaPath}.${listInfo.listKey}`;
        const settled = await Promise.allSettled(
          items.map((item, idx) =>
            createLabel(schemaPath, listInfo.type, item, {
              resolveUrl: buildLabelResolveUrl(
                sources,
                expandedPath,
                true,
                idx,
                item,
              ),
              skipMaskDecode: hasExistingOverlay(
                (item as { _id?: string })?._id ?? "",
              ),
            }),
          ),
        );

        labels.push(...collectFulfilled(settled, `schema "${schemaPath}"`));
      }
    } else if (KNOWN_SINGULAR_TYPES.has(cls)) {
      try {
        labels.push(
          await createLabel(schemaPath, cls as LabelType, fieldData, {
            resolveUrl: buildLabelResolveUrl(
              sources,
              schemaPath,
              false,
              0,
              fieldData,
            ),
            skipMaskDecode: hasExistingOverlay(
              (fieldData as { _id?: string })?._id ?? "",
            ),
          }),
        );
      } catch (err) {
        console.warn(
          `Skipping label at "${schemaPath}": failed to create annotation label`,
          err,
        );
      }
    } else {
      console.warn(`Unsupported label _cls "${cls}" for field "${schemaPath}"`);
    }
  }

  return labels.sort((a, b) =>
    (a.data.label ?? "").localeCompare(b.data?.label ?? ""),
  );
=======
export const useAnnotationLabelsReady = (): boolean => {
  const schemasLoaded = useAtomValue(activeLabelSchemas) !== null;
  const sampleId = useActiveAnnotationSampleId();
  return schemasLoaded && Boolean(sampleId);
>>>>>>> main
};

export const addLabel = atom(
  undefined,
  (get, set, newLabel: AnnotationLabel) => {
    const existingLabels = get(labels);
    const alreadyHaveIt = existingLabels.some(
      (label) => label.overlay.id === newLabel.overlay.id,
    );

    if (!alreadyHaveIt) {
      const newList = [...existingLabels, newLabel];

<<<<<<< HEAD
      set(
        labels,
        newList.sort((a, b) =>
          (a.data.label ?? "").localeCompare(b.data?.label ?? ""),
        ),
      );
=======
      set(labels, newList.sort(byLabelName));
>>>>>>> main
    }
  },
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
        set(targetAtom, { ...currentValue, data } as AnnotationLabel);
        return true;
      }

      return false;
    }, []),
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
      [],
    ),
  );

  const removeLabelFromSidebar = useCallback(
    (labelId: string) =>
      setLabels((prev) => prev.filter((label) => label.data._id !== labelId)),
    [setLabels],
  );

  return useMemo(
    () => ({
      addLabelToSidebar,
      getLabelById,
      removeLabelFromSidebar,
      updateLabelData,
    }),
    [addLabelToSidebar, getLabelById, removeLabelFromSidebar, updateLabelData],
  );
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
  label: AnnotationLabelData,
): AnnotationLabel["overlay"] =>
  ({ id, field, label }) as unknown as AnnotationLabel["overlay"];

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
  const isPatches = useRecoilValue(isPatchesView);
  const setEntranceLabel = useSetEntranceLabel();
  const setLoading = useSetAtom(labelsState);

  // the sample the sidebar reflects — the selected 2D slice, or the pinned 3D
  // scene when its slice is selected (the one group-aware resolver)
  const sampleId = useActiveAnnotationSampleId();

  // ids the mirror derived on its last pass, and for which sample — a row
  // that WAS engine-derived and no longer is was deleted (drop it, don't
  // pass it through); a sample switch starts from an empty list
  const derivedIds = useRef<Set<string>>(new Set());
  const derivedFor = useRef<string | null>(null);

  const reconcile = useCallback(() => {
    if (!sampleId || !active) {
      return;
    }

<<<<<<< HEAD
        return type as LabelType;
      },
    [],
  );
=======
    const store = getDefaultStore();
    const current = store.get(labels);
    const previous = derivedFor.current === sampleId ? current : [];
    const previousById = new Map(previous.map((l) => [l.data._id, l]));
    const engineIds = new Set<string>();
    const next: AnnotationLabel[] = [];
>>>>>>> main

    for (const path of active) {
      const type = SINGULAR[engine.getLabelType(path)];

      if (!type) {
        continue;
      }

      for (const data of engine.listLabels({ sample: sampleId, path })) {
        engineIds.add(data._id);

        // The scene keys overlays by the track's `instance._id` (the engine
        // `instanceId`), which equals the doc `_id` for an untracked 2D label
        // but differs for a per-frame video track — so resolve the instance id
        // to find the live overlay (and its mask), falling back to `_id`.
        const instanceId =
          (data as { instance?: { _id?: string } }).instance?._id ?? data._id;

        const prev = previousById.get(data._id);
        const mounted = scene?.getOverlay(instanceId);
        const live = mounted && mounted.field === path ? mounted : undefined;

        // keep stub identity across reconciles while the data is unchanged;
        // a data change rebuilds the stub so its label never goes stale
        const overlay = (live ??
          (prev && sameData(prev.data, data as AnnotationLabelData)
            ? prev.overlay
            : stubOverlay(
                data._id,
                path,
                data as AnnotationLabelData,
              ))) as AnnotationLabel["overlay"];

<<<<<<< HEAD
      if (loadingRef.current === LabelsState.UNSET) {
        loadingRef.current = LabelsState.LOADING;
        setLoading(LabelsState.LOADING);
        getLabelsFromSample().then((result) => {
          if (stale) {
            loadingRef.current = LabelsState.UNSET;
            return;
          }

          // Attach overlays to the scene before exposing them to the app.
          // This ensures that geometry is grounded in some frame of reference.
          const initialOverlayIds = new Set<string>();
          for (const annotationLabel of result) {
            addLabelToRenderer(annotationLabel);
            initialOverlayIds.add(annotationLabel.data._id);
          }

          setLabels(result);
          setInitialOverlayIds(initialOverlayIds);

          // In patches view with a single label, activate it for editing
          // via the entranceLabelId mechanism (reuses the quick-edit flow)
          if (isPatches && result.length === 1) {
            setActiveLabelId(result[0].data._id);
          }

          loadingRef.current = LabelsState.COMPLETE;
          setLoading(LabelsState.COMPLETE);
        });
      } else if (loadingRef.current === LabelsState.COMPLETE) {
        // refresh label data
        getLabelsFromSample().then((result) => {
          if (stale) return;

          result.forEach((annotationLabel) => {
            const existingOverlay = scene?.getOverlay(annotationLabel.data._id);

            // use existing overlay if available
            if (existingOverlay) {
              // refresh data
              existingOverlay.label = annotationLabel.data;
              // reuse overlay
              annotationLabel.overlay =
                existingOverlay as AnnotationLabel["overlay"];
            }

            // update sidebar, or add if this is a new label
            const updated = updateLabelAtom(
              annotationLabel.data._id,
              annotationLabel.data,
            );

            // new label, add it. Attach to the scene first so the overlay
            // has its coordinate system before any sidebar subscriber tries
            // to read bounds off it.
            if (!updated) {
              addLabelToRenderer(annotationLabel);
              addLabelToStore(annotationLabel);
            }
          });
        });
=======
        const entry = {
          data: data as AnnotationLabelData,
          overlay,
          path,
          type,
        } as AnnotationLabel;
        next.push(prev && sameEntry(prev, entry) ? prev : entry);
>>>>>>> main
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

  // first hydration per sample: loading gate (one-shot per sample)
  const completedFor = useRef<string | null>(null);

  useEffect(() => {
    if (completedFor.current !== sampleId) {
      completedFor.current = null;
      setLoading(sampleId ? LabelsState.LOADING : LabelsState.UNSET);
    }
  }, [sampleId, setLoading]);

  // patches single-label auto-edit: open the source label for editing as soon
  // as it is discoverable. Kept SEPARATE from the loading gate and re-evaluated
  // on every engine tick (and whenever the active schema changes) so it
  // survives the label arriving async OR the source field being activated
  // after entry. Fires at most once per sample — the user is free to deselect.
  const enteredFor = useRef<string | null>(null);

  const maybeEnterPatchLabel = useCallback(() => {
    if (!isPatches || !sampleId || !active || enteredFor.current === sampleId) {
      return;
    }

    // count from the engine, not the mirror — a gated overlay hasn't mounted
    // yet but still makes the patch single-label
    const all = active.flatMap((path) =>
      SINGULAR[engine.getLabelType(path)]
        ? engine.listLabels({ sample: sampleId, path }).map((label) => ({
            sample: sampleId,
            path,
            instanceId: label._id,
          }))
        : [],
    );

    if (all.length === 1) {
      enteredFor.current = sampleId;
      setEntranceLabel(all[0]);
    }
  }, [active, engine, isPatches, sampleId, setEntranceLabel]);

  useEffect(() => {
    reconcile();
    maybeEnterPatchLabel();

    // completeness keys on the engine, never on a surface being mounted —
    // a 3D slice has no Lighter scene; 2D rows start as stubs and upgrade
    // when the scene mounts
    if (completedFor.current !== sampleId && sampleId && active) {
      completedFor.current = sampleId;
      setLoading(LabelsState.COMPLETE);
    }

    return engine.subscribe(() => {
      reconcile();
      maybeEnterPatchLabel();
    });
  }, [active, engine, maybeEnterPatchLabel, reconcile, sampleId, setLoading]);

  // gated mounts insert without an engine change
  const on = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );
  on(
    "lighter:overlay-added",
    useCallback(() => reconcile(), [reconcile]),
  );
}
