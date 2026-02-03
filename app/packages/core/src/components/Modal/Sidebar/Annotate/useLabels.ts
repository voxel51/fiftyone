import { useLighter } from "@fiftyone/lighter";
import {
  activeFields,
  AnnotationLabel,
  field,
  modalGroupSlice,
  ModalSample,
  modalSample,
} from "@fiftyone/state";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { splitAtom } from "jotai/utils";
import { get } from "lodash";
import { useEffect, useRef } from "react";
import {
  selector,
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
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

export default function useLabels() {
  const paths = useRecoilValue(pathMap);
  const modalSampleData = useRecoilValueLoadable(modalSample);
  const setLabels = useSetAtom(labels);
  const [loadingState, setLoading] = useAtom(labelsState);
  const active = useAtomValue(activeLabelSchemas);
  const addLabel = useAddAnnotationLabelToRenderer();
  const createLabel = useCreateAnnotationLabel();
  const { scene } = useLighter();
  const currentSlice = useRecoilValue(modalGroupSlice);
  const prevSliceRef = useRef(currentSlice);

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

  useEffect(() => {
    if (
      modalSampleData.state !== "loading" &&
      active &&
      loadingState === LabelsState.UNSET
    ) {
      setLoading(LabelsState.LOADING);
      handleSample({
        createLabel,
        paths,
        sample: modalSampleData.contents,
        getFieldType,
        schemas: active,
      }).then((result) => {
        setLabels(result);
        result.forEach((annotationLabel) => addLabel(annotationLabel));
        setLoading(LabelsState.COMPLETE);
      });
    }
  }, [
    active,
    getFieldType,
    loadingState,
    modalSampleData,

    paths,

    setLabels,
    setLoading,
  ]);

  useEffect(() => {
    scene;

    return () => {
      setLabels([]);
      setLoading(LabelsState.UNSET);
    };
  }, [scene, setLabels, setLoading]);

  useHover();
  useFocus();
}
