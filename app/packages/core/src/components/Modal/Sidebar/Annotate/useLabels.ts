import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import type { DetectionLabel } from "@fiftyone/looker/src/overlays/detection";
import type { ModalSample, PathFilterSelector } from "@fiftyone/state";
import { activeFields, modalSample, pathFilter } from "@fiftyone/state";
import { atom, useSetAtom } from "jotai";
import { get } from "lodash";
import { useEffect } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";

export interface AnnotationLabel {
  id: string;
  data: ClassificationLabel | DetectionLabel;
  path: string;
}

const handleSample = ({
  active,
  filter,
  sample,
}: {
  active: string[];
  sample: ModalSample;
  filter: PathFilterSelector;
}) => {
  const data = sample.sample;
  const labels: AnnotationLabel[] = [];

  for (let index = 0; index < active.length; index++) {
    const path = active[index];
    const result = get(data, path);

    const array = Array.isArray(result) ? result : result ? [result] : [];

    for (const data of array) {
      labels.push({ data, path, id: data._id });
    }
  }

  return labels.sort((a, b) =>
    (a.data.label ?? "").localeCompare(b.data?.label ?? "")
  );
};

export const labels = atom<Array<AnnotationLabel>>([]);
export const loading = atom(true);

export default function useLabels() {
  const active = useRecoilValue(activeFields({ expanded: true, modal: true }));
  const filter = useRecoilValue(pathFilter(true));
  const modalSampleData = useRecoilValueLoadable(modalSample);
  const setLabels = useSetAtom(labels);
  const setLoading = useSetAtom(loading);

  useEffect(() => {
    if (modalSampleData.state !== "loading") {
      setLabels(
        handleSample({ active, filter, sample: modalSampleData.contents })
      );
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [active, filter, modalSampleData, setLabels, setLoading]);
}
