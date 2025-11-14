import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel, ModalSample } from "@fiftyone/state";
import { activeFields, field, modalSample } from "@fiftyone/state";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { splitAtom } from "jotai/utils";
import { get } from "lodash";
import { useEffect } from "react";
import {
  selector,
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import type { LabelType } from "./Edit/state";
import type { AnnotationSchemas } from "./state";
import { schemas } from "./state";
import { useAddAnnotationLabel } from "./useAddAnnotationLabel";
import useFocus from "./useFocus";
import useHover from "./useHover";

const handleSample = async ({
  addLabel,
  getFieldType,
  paths,
  sample,
  schemas,
}: {
  addLabel: ReturnType<typeof useAddAnnotationLabel>;
  getFieldType: (path: string) => Promise<LabelType>;
  paths: { [key: string]: string };
  sample: ModalSample;
  schemas: AnnotationSchemas;
}) => {
  const data = sample.sample;
  const labels: AnnotationLabel[] = [];

  for (const path in paths) {
    if (!schemas[path]?.active) {
      continue;
    }

    const type = await getFieldType(paths[path]);
    const result = get(data, paths[path]);

    const array = Array.isArray(result) ? result : result ? [result] : [];

    for (const data of array) {
      const label = addLabel(path, type, data);
      labels.push(label);
    }
  }

  return labels.sort((a, b) =>
    (a.data.label ?? "").localeCompare(b.data?.label ?? "")
  );
};

export const addLabel = atom(undefined, (get, set, label: AnnotationLabel) => {
  const list = get(labels);
  const newList = [...list, label];

  set(
    labels,
    newList.sort((a, b) =>
      (a.data.label ?? "").localeCompare(b.data?.label ?? "")
    )
  );
});

export const labels = atom<Array<AnnotationLabel>>([]);
export const labelAtoms = splitAtom(labels, ({ overlay }) => overlay.id);
export const labelsByPath = atom((get) => {
  const map = {};
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
  const schemaMap = useAtomValue(schemas);
  const addLabel = useAddAnnotationLabel();
  const { scene } = useLighter();

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

  useEffect(() => {
    if (
      modalSampleData.state !== "loading" &&
      schemaMap &&
      loadingState === LabelsState.UNSET
    ) {
      setLoading(LabelsState.LOADING);
      handleSample({
        addLabel,
        paths,
        sample: modalSampleData.contents,
        getFieldType,
        schemas: schemaMap,
      }).then((result) => {
        setLoading(LabelsState.COMPLETE);
        setLabels(result);
      });
    }
  }, [
    addLabel,
    getFieldType,
    loadingState,
    modalSampleData,

    paths,
    schemaMap,

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
