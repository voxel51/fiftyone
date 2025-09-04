import type {
  LabelEntry,
  ModalSample,
  PathFilterSelector,
  SidebarEntry,
} from "@fiftyone/state";
import {
  EntryKind,
  activeFields,
  modalSample,
  pathFilter,
} from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { get } from "lodash";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { objectsExpanded, primitivesExpanded } from "./GroupEntry";

const getLabels = ({
  active,
  filter,
  sample,
}: {
  active: string[];
  sample: ModalSample;
  filter: PathFilterSelector;
  paths: string[];
}) => {
  const data = sample.sample;
  const labels: LabelEntry[] = [];

  for (let index = 0; index < active.length; index++) {
    const path = active[index];
    const result = get(data, path);

    const array = Array.isArray(result) ? result : result ? [result] : [];

    for (const label of array) {
      labels.push({ kind: EntryKind.LABEL, id: label._id, label });
    }
  }

  return labels;
};

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const active = useRecoilValue(activeFields({ expanded: true, modal: true }));
  const filter = useRecoilValue(pathFilter(true));
  const modalSampleData = useRecoilValueLoadable(modalSample);
  const showObjects = useAtomValue(objectsExpanded);
  const showPrimitives = useAtomValue(primitivesExpanded);

  const labels = showObjects
    ? modalSampleData.state === "loading"
      ? [{ kind: EntryKind.LOADING, id: "labels" }]
      : getLabels({ active, filter, sample: modalSampleData.contents })
    : [];

  const primitives = showPrimitives ? [] : [];

  return [
    [
      { kind: EntryKind.GROUP, name: "Objects" },
      ...labels,
      { kind: EntryKind.GROUP, name: "Primitives" },
    ] as SidebarEntry[],
    () => {},
  ];
};

export default useEntries;
