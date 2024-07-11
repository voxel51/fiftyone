import { ID } from "@fiftyone/spotlight";
import type { Sample } from "@fiftyone/state";

import {
  selectedSampleObjects,
  selectedSamples,
  useSetSelected,
} from "@fiftyone/state";
import { MutableRefObject } from "react";
import { useRecoilCallback } from "recoil";

export interface SelectThumbnailData {
  shiftKey: boolean;
  id: string;
  sample: Sample;
  symbol: ID;
}

type Records = MutableRefObject<Map<string, number>>;

const argFact = (compareFn) => (array) =>
  array.map((el, idx) => [el, idx]).reduce(compareFn)[1];

const argMin = argFact((max, el) => (el[0] < max[0] ? el : max));

const addRange = (index: number, items: string[], records: Records) => {
  const reverse = Object.fromEntries(
    Array.from(records.current.entries()).map(([k, v]) => [v, k])
  );

  const min = argMin(
    items.map((id) => Math.abs(records.current.get(id) - index))
  );

  const close = records.current.get(items[min]);

  const [start, end] = index < close ? [index, close] : [close, index];

  const added = new Array(end - start + 1)
    .fill(0)
    .map((_, i) => reverse[i + start]);

  return new Set([...items, ...added]);
};

const removeRange = (
  index: number,
  selected: Set<string>,
  records: Records
) => {
  const reverse = Object.fromEntries(
    Array.from(records.current.entries()).map(([k, v]) => [v, k])
  );

  let before = index;
  while (selected.has(reverse[before])) {
    before--;
  }
  before += 1;

  let after = index;
  while (selected.has(reverse[after])) {
    after++;
  }
  after -= 1;

  const [start, end] =
    index - before <= after - index
      ? index - before === 0
        ? [index, after]
        : [before, index]
      : after - index === 0
      ? [before, index]
      : [index, after];

  return new Set(
    Array.from(selected).filter(
      (s) => records.current.get(s) < start || records.current.get(s) > end
    )
  );
};

export default () => {
  const setSelected = useSetSelected();

  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (
        records: Records,
        { shiftKey, id: sampleId, sample, symbol }: SelectThumbnailData
      ) => {
        let selected = new Set(await snapshot.getPromise(selectedSamples));
        const selectedObjects = new Map(
          await snapshot.getPromise(selectedSampleObjects)
        );

        const items = Array.from(selected);
        const index = records.current.get(symbol.description);
        if (shiftKey && !selected.has(sampleId)) {
          selected = addRange(index, items, records);
        } else if (shiftKey) {
          selected = removeRange(index, selected, records);
        } else {
          selected.has(sampleId)
            ? selected.delete(sampleId)
            : selected.add(sampleId);
        }

        if (selectedObjects.has(sampleId)) {
          selectedObjects.delete(sampleId);
        } else {
          selectedObjects.set(sampleId, sample);
        }

        set(selectedSamples, selected);
        set(selectedSampleObjects, selectedObjects);
        setSelected(new Set(selected));
      },
    [setSelected]
  );
};
