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

    const type = await getFieldType(paths[path]);
    const result = get(data, paths[path]);

    const array = Array.isArray(result) ? result : result ? [result] : [];

    labels.push(...array.map((data) => createLabel(path, type, data)));
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
    useCallback((get, set, id: string, data: AnnotationLabelData) => {
      const labelMapValue = get(labelMap);
      const targetAtom = labelMapValue[id];

      if (targetAtom) {
        const currentValue = get(targetAtom);
        set(targetAtom, { ...currentValue, data });
      } else {
        console.warn(`Unknown label id ${id}`);
      }
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
  const addLabel = useAddAnnotationLabelToRenderer();
  const createLabel = useCreateAnnotationLabel();
  const { scene, removeOverlay } = useLighter();
  const currentSlice = useRecoilValue(modalGroupSlice);
  const prevSliceRef = useRef(currentSlice);
  const updateLabelAtom = useUpdateLabelAtom();

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
          setLabels(result);
          result.forEach((annotationLabel) => addLabel(annotationLabel));
          setLoading(LabelsState.COMPLETE);
        });
      } else if (loadingState === LabelsState.COMPLETE) {
        // refresh label data
        getLabelsFromSample().then((result) => {
          result.forEach((annotationLabel) => {
            // update overlays
            if (scene?.hasOverlay(annotationLabel.data._id)) {
              scene.getOverlay(annotationLabel.data._id)!.label =
                annotationLabel.data;
            }

            // update sidebar
            updateLabelAtom(annotationLabel.data._id, annotationLabel.data);
          });
        });
      }
    }
  }, [active, getFieldType, loadingState, modalSample?.sample, paths]);

  useEffect(() => {
    return () => {
      setLabels([]);
      setLoading(LabelsState.UNSET);
    };
  }, [scene]);

  useHover();
  useFocus();
}
