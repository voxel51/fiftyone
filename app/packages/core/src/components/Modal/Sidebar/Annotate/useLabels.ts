import { DetectionOverlay, useLighter } from "@fiftyone/lighter";
import {
  activeFields,
  AnnotationLabel,
  AnnotationLabelData,
  field,
  isPatchesView,
  ModalSample,
  useCurrentSampleId,
  useModalSample,
} from "@fiftyone/state";
import { getNormalizedUrls } from "@fiftyone/state/src/utils";
import { getSampleSrc } from "@fiftyone/state/src/recoil/utils";
import { DETECTION } from "@fiftyone/utilities";
import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { splitAtom, useAtomCallback } from "jotai/utils";
import { get } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selector, useRecoilCallback, useRecoilValue } from "recoil";
import type { LabelType } from "./Edit/useAnnotationContext";
import {
  isFieldReadOnly,
  labelSchemasData,
  visibleLabelSchemas,
} from "./state";
import { useAddAnnotationLabelToRenderer } from "./useAddAnnotationLabelToRenderer";
import { useSetActiveLabelId } from "./useAnnotationContextManager";
import { useCreateAnnotationLabel } from "./useCreateAnnotationLabel";
import useHover from "./useHover";

/**
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
 *
 * Resolution order:
 *   1. Look up the sub-field's structural key (e.g.
 *      `"ground_truth.detections[0].mask_path"`) in the sample's `sources`
 *      map. Mirrors looker's key construction in
 *      `app/packages/looker/src/worker/disk-overlay-decoder.ts`.
 *   2. Fall back to `getSampleSrc(rawValue)` on the sub-field's raw value.
 *
 * Returns `undefined` if neither path produces a usable URL.
 *
 * The closure captures the label's structural context — the expanded
 * sample path, whether the label is a list item, and its index — so the
 * downstream factory can just ask by sub-field name without knowing where
 * its label lives in the sample tree.
 */
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

      set(
        labels,
        newList.sort((a, b) =>
          (a.data.label ?? "").localeCompare(b.data?.label ?? ""),
        ),
      );
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

const pathMap = selector<{ [key: string]: string }>({
  key: "annotationPathMap",
  get: ({ get }) => {
    const paths = get(activeFields({ expanded: false, modal: true }));
    const expandedPaths = get(activeFields({ expanded: true, modal: true }));

    return Object.fromEntries(paths.map((path, i) => [path, expandedPaths[i]]));
  },
});

export const useLabelsCount = () => {
  return useAtomValue(labels).length;
};

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

export default function useLabels() {
  const paths = useRecoilValue(pathMap);
  const currentLabels = useAtomValue(labels);
  const modalSample = useModalSample();
  const currentSampleId = useCurrentSampleId();
  const setLabels = useSetAtom(labels);
  const setLoading = useSetAtom(labelsState);
  const active = useAtomValue(visibleLabelSchemas);
  const addLabelToRenderer = useAddAnnotationLabelToRenderer();
  const addLabelToStore = useSetAtom(addLabel);
  const createLabel = useCreateAnnotationLabel();
  const { scene, removeOverlay } = useLighter();
  const updateLabelAtom = useUpdateLabelAtom();
  const isPatches = useRecoilValue(isPatchesView);
  const setActiveLabelId = useSetActiveLabelId();
  const [initialOverlayIds, setInitialOverlayIds] =
    useState<Set<string> | null>(null);

  // Use a ref for the loading state machine to avoid having it as an effect
  // dependency. When loadingState was both a dep and mutated inside the effect,
  // the UNSET→LOADING state change triggered a re-render whose cleanup set
  // stale=true, causing the async result to be discarded and the state reset
  // to UNSET — an infinite loop that prevented labels from ever loading.
  const loadingRef = useRef(LabelsState.UNSET);

  const getFieldType = useRecoilCallback(
    ({ snapshot }) =>
      async (path: string) => {
        const loadable = await snapshot.getLoadable(field(path));
        const type = loadable
          .getValue()
          ?.embeddedDocType?.split(".")
          .slice(-1)[0];

        if (!type) {
          throw new Error("no type");
        }

        return type as LabelType;
      },
    [],
  );

  // Reset labels when active schemas change to reload and update scene
  useEffect(() => {
    const resetOverlays = () => {
      currentLabels.forEach((label) => {
        removeOverlay(label.overlay.id, false);
      });

      setLabels([]);
      loadingRef.current = LabelsState.UNSET;
      setLoading(LabelsState.UNSET);
    };

    resetOverlays();
  }, [active, removeOverlay, setLabels, setLoading]);

  // Reset when the sample changes so the primary loading effect below starts
  // fresh instead of entering the refresh path with stale labels.
  useEffect(() => {
    return () => {
      currentLabels.forEach((label) => {
        removeOverlay(label.overlay.id, false);
      });
      setLabels([]);
      loadingRef.current = LabelsState.UNSET;
      setLoading(LabelsState.UNSET);
    };
  }, [currentSampleId, scene, removeOverlay, setLabels, setLoading]);

  useEffect(() => {
    // Flipped to `true` by the cleanup function so in-flight async work
    // from a superseded effect invocation can bail out before mutating state.
    let stale = false;

    if (modalSample?.sample && active) {
      const getLabelsFromSample = () =>
        handleSample({
          createLabel,
          paths,
          sample: modalSample,
          getFieldType,
          schemas: active,
          hasExistingOverlay: (id) => !!id && !!scene?.getOverlay(id),
        });

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
      }
    }

    return () => {
      stale = true;
    };
  }, [
    active,
    addLabelToRenderer,
    addLabelToStore,
    createLabel,
    currentSampleId,
    getFieldType,
    isPatches,
    modalSample?.sample,
    paths,
    scene,
    setActiveLabelId,
    setLabels,
    setLoading,
    updateLabelAtom,
  ]);

  useSyncOverlayReadOnly();
  useHover();

  return initialOverlayIds;
}
