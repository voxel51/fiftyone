import { useLighter } from "@fiftyone/lighter";
import {
  activeFields,
  AnnotationLabel,
  AnnotationLabelData,
  field,
  modalGroupSlice,
  ModalSample,
  useModalSample,
} from "@fiftyone/state";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { splitAtom, useAtomCallback } from "jotai/utils";
import { get } from "lodash";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { selector, useRecoilCallback, useRecoilValue } from "recoil";
import type { LabelType } from "./Edit/state";
import { activeLabelSchemas } from "./state";
import { useAddAnnotationLabelToRenderer } from "./useAddAnnotationLabelToRenderer";
import useFocus from "./useFocus";
import useHover from "./useHover";
import { useCreateAnnotationLabel } from "./useCreateAnnotationLabel";

/**
 * Map from plural label _cls to the list key and singular LabelType.
 * Used to load labels from sample data when the field is not yet in the
 * Recoil schema (e.g. field just created via Schema Manager).
 */
const LABEL_LIST_INFO: Record<string, { listKey: string; type: LabelType }> = {
  Detections: { listKey: "detections", type: "Detection" },
  Classifications: { listKey: "classifications", type: "Classification" },
  Polylines: { listKey: "polylines", type: "Polyline" },
};

const handleSample = async ({
  createLabel,
  getFieldType,
  paths,
  sample,
  schemas,
}: {
  createLabel: ReturnType<typeof useCreateAnnotationLabel>;
  getFieldType: (path: string) => Promise<LabelType>;
  paths: { [key: string]: string };
  sample: ModalSample;
  schemas: string[];
}) => {
  const data = sample.sample;
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
        error
      );

      continue;
    }
    const result = get(data, paths[path]);

    const array = Array.isArray(result) ? result : result ? [result] : [];

    labels.push(...array.map((data) => createLabel(path, type, data)));
  }

  // Process fields in activeLabelSchemas that aren't in Recoil's activeFields
  // (e.g. fields created via Schema Manager not yet in the Recoil schema cache)
  const KNOWN_SINGULAR_TYPES = new Set<string>([
    "Classification",
    "Detection",
    "Polyline",
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
        labels.push(
          ...items.map((item) => createLabel(schemaPath, listInfo.type, item))
        );
      }
    } else if (KNOWN_SINGULAR_TYPES.has(cls)) {
      labels.push(createLabel(schemaPath, cls as LabelType, fieldData));
    } else {
      console.warn(`Unsupported label _cls "${cls}" for field "${schemaPath}"`);
    }
  }

  return labels.sort((a, b) =>
    (a.data.label ?? "").localeCompare(b.data?.label ?? "")
  );
};

export const addLabel = atom(
  undefined,
  (get, set, newLabel: AnnotationLabel) => {
    const existingLabels = get(labels);
    const alreadyHaveIt = existingLabels.some(
      (label) => label.overlay.id === newLabel.overlay.id
    );

    if (!alreadyHaveIt) {
      const newList = [...existingLabels, newLabel];

      set(
        labels,
        newList.sort((a, b) =>
          (a.data.label ?? "").localeCompare(b.data?.label ?? "")
        )
      );
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

const pathMap = selector<{ [key: string]: string }>({
  key: "annotationPathMap",
  get: ({ get }) => {
    const paths = get(activeFields({ expanded: false, modal: true }));
    const expandedPaths = get(activeFields({ expanded: true, modal: true }));

    return Object.fromEntries(paths.map((path, i) => [path, expandedPaths[i]]));
  },
});

/**
 * Hook which provides a method for updating data in a label atom.
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
 * Hook which provides access to the current {@link LabelsContext}.
 */
export const useLabelsContext = (): LabelsContext => {
  const addLabelToSidebar = useSetAtom(addLabel);
  const updateLabelData = useUpdateLabelAtom();
  const setLabels = useSetAtom(labels);

  const removeLabelFromSidebar = useCallback(
    (labelId: string) =>
      setLabels((prev) => prev.filter((label) => label.data._id !== labelId)),
    [setLabels]
  );

  return useMemo(
    () => ({ addLabelToSidebar, removeLabelFromSidebar, updateLabelData }),
    [addLabelToSidebar, removeLabelFromSidebar, updateLabelData]
  );
};

export default function useLabels() {
  const paths = useRecoilValue(pathMap);
  const currentLabels = useAtomValue(labels);
  const modalSample = useModalSample();
  const setLabels = useSetAtom(labels);
  const [loadingState, setLoading] = useAtom(labelsState);
  const active = useAtomValue(activeLabelSchemas);
  const addLabelToRenderer = useAddAnnotationLabelToRenderer();
  const addLabelToStore = useSetAtom(addLabel);
  const createLabel = useCreateAnnotationLabel();
  const { scene, removeOverlay } = useLighter();
  const currentSlice = useRecoilValue(modalGroupSlice);
  const prevSliceRef = useRef(currentSlice);
  const updateLabelAtom = useUpdateLabelAtom();

  const getFieldType = useRecoilCallback(
    ({ snapshot }) => async (path: string) => {
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
    []
  );

  // This effect resets labels when the annotation slice changes for grouped datasets
  useEffect(() => {
    if (prevSliceRef.current !== currentSlice && currentSlice) {
      prevSliceRef.current = currentSlice;
      setLabels([]);
      setLoading(LabelsState.UNSET);
    }
  }, [currentSlice]);

  // Reset labels when active schemas change to reload and update scene
  useEffect(() => {
    const resetOverlays = () => {
      currentLabels.forEach((label) => {
        removeOverlay(label.overlay.id, false);
      });

      setLabels([]);
      setLoading(LabelsState.UNSET);
    };

    resetOverlays();
  }, [active, removeOverlay, setLabels, setLoading]); // omit: [currentLabels]

  useEffect(() => {
    let stale = false;

    if (modalSample?.sample && active) {
      const getLabelsFromSample = () =>
        handleSample({
          createLabel,
          paths,
          sample: modalSample,
          getFieldType,
          schemas: active,
        });

      if (loadingState === LabelsState.UNSET) {
        setLoading(LabelsState.LOADING);
        getLabelsFromSample().then((result) => {
          if (stale) {
            setLoading(LabelsState.UNSET);
            return;
          }

          setLabels(result);
          result.forEach((annotationLabel) =>
            addLabelToRenderer(annotationLabel)
          );
          setLoading(LabelsState.COMPLETE);
        });
      } else if (loadingState === LabelsState.COMPLETE) {
        // refresh label data
        getLabelsFromSample().then((result) => {
          if (stale) return;

          result.forEach((annotationLabel) => {
            // update overlays
            if (scene?.hasOverlay(annotationLabel.data._id)) {
              scene.getOverlay(annotationLabel.data._id)!.label =
                annotationLabel.data;
            }

            // update sidebar, or add if this is a new label
            const updated = updateLabelAtom(
              annotationLabel.data._id,
              annotationLabel.data
            );

            // new label
            if (!updated) {
              addLabelToStore(annotationLabel);
              addLabelToRenderer(annotationLabel);
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
    getFieldType,
    loadingState,
    modalSample?.sample,
    paths,
  ]);

  useEffect(() => {
    return () => {
      setLabels([]);
      setLoading(LabelsState.UNSET);
    };
  }, [scene]);

  useHover();
  useFocus();
}
