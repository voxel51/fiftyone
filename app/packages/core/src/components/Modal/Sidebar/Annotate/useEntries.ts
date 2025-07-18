import type { ModalSample, PathFilterSelector } from "@fiftyone/state";
import {
  EntryKind,
  State,
  activeFields,
  fieldSchema,
  modalSample,
  pathFilter,
} from "@fiftyone/state";
import type { Schema } from "@fiftyone/utilities";
import { atom, getDefaultStore, useAtom } from "jotai";
import { splitAtom } from "jotai/utils";
import { get } from "lodash";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";

const jotaiStore = getDefaultStore();

const labelsAtom = atom([]);
const labelAtom = splitAtom(labelsAtom, (label) => label._id);

const getLabels = ({
  active,
  filter,
  sample,
  schema,
}: {
  active: string[];
  sample: ModalSample;
  filter: PathFilterSelector;
  schema: Schema;
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
  const schema = useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));

  const labels = useEffect(() => {
    return jotaiStore.set(
      labelsAtom,
      getLabels({ active, filter, sample: modalSampleData, schema })
    );
  }, []);

  const [labelAtoms, dispatch] = useAtom(labelAtom);

  return [
    [
      { kind: EntryKind.GROUP, name: "Objects" },
      ...getLabels({ active, filter, sample: modalSampleData, schema }).map(
        (la) => {
          return {
            kind: EntryKind.LABEL,
            id: la._id,
            label: la,
          };
        }
      ),
      { kind: EntryKind.GROUP, name: "Primitives" },
    ],
    (entry) => {},
  ];
};

export default useEntries;
