import type { ModalSample, PathFilterSelector } from "@fiftyone/state";
import {
  EntryKind,
  activeFields,
  modalSample,
  pathFilter,
} from "@fiftyone/state";
import { atom, getDefaultStore } from "jotai";
import { splitAtom } from "jotai/utils";
import { get } from "lodash";
import { useRecoilValue } from "recoil";

const jotaiStore = getDefaultStore();

const labelsAtom = atom([]);
const labelAtom = splitAtom(labelsAtom, (label) => label._id);

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

  const labels = [];

  for (let index = 0; index < active.length; index++) {
    const path = active[index];
    const d = get(data, path);

    if (Array.isArray(d)) {
      labels.push(...d);
    } else {
      labels.push(d);
    }
  }

  return labels;
};

const useEntries = () => {
  const active = useRecoilValue(activeFields({ expanded: true, modal: true }));
  const filter = useRecoilValue(pathFilter(true));
  const modalSampleData = useRecoilValue(modalSample);

  return [
    [
      { kind: EntryKind.GROUP, name: "Objects" },
      ...getLabels({ active, filter, sample: modalSampleData }).map((la) => {
        return {
          kind: EntryKind.LABEL,
          id: la?._id,
          label: la,
        };
      }),
      { kind: EntryKind.GROUP, name: "Primitives" },
    ],
    (entry) => {},
  ];
};

export default useEntries;
