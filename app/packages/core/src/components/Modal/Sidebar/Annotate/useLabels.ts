import { useLighter } from "@fiftyone/lighter";
import type {
  AnnotationLabel,
  ModalSample,
  PathFilterSelector,
} from "@fiftyone/state";
import { activeFields, field, modalSample, pathFilter } from "@fiftyone/state";
import { atom, useAtomValue, useSetAtom } from "jotai";
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
  filter,
  getFieldType,
  paths,
  sample,
  schemas,
}: {
  addLabel: ReturnType<typeof useAddAnnotationLabel>;
  filter: PathFilterSelector;
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
      if (!filter(path, data)) {
        continue;
      }

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
export const loading = atom(true);

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
  const filter = useRecoilValue(pathFilter(true));
  const modalSampleData = useRecoilValueLoadable(modalSample);
  const setLabels = useSetAtom(labels);
  const setLoading = useSetAtom(loading);
  const schemaMap = useAtomValue(schemas);
  const addLabel = useAddAnnotationLabel();
  const { scene } = useLighter();
  const sceneId = scene?.getSceneId();

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
    if (modalSampleData.state !== "loading" && schemaMap) {
      handleSample({
        addLabel,
        paths,
        filter,
        sample: modalSampleData.contents,
        getFieldType,
        schemas: schemaMap,
      }).then((result) => {
        setLoading(false);
        setLabels(result);
      });
    } else {
      setLoading(true);
    }
    return () => {
      // clear the scene on unmount
      setLoading(true);
      setLabels([]);
      scene?.clear();
    };
  }, [
    addLabel,
    filter,
    getFieldType,
    modalSampleData,
    paths,
    schemaMap,
    scene,
    setLabels,
    setLoading,
  ]);

  useHover();
  useFocus();
}
