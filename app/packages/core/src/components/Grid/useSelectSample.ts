import type { ID } from "@fiftyone/spotlight";
import type { Sample } from "@fiftyone/state";
import {
  selectedSampleObjects,
  selectedSamples,
  useSetSelected,
} from "@fiftyone/state";
import { useRef } from "react";
import { useRecoilCallback } from "recoil";
import type { Records } from "./useRecords";

export interface SelectThumbnailData {
  shiftKey: boolean;
  id: string;
  sample: Sample;
  symbol: ID;
}

export const addRange = (
  index: number,
  selected: Set<string>,
  records: Records
) => {
  // filter selections without an index record
  const items = [...selected].filter((i) => records.has(i));
  const reverse = Object.fromEntries(
    Array.from(records.entries()).map(([k, v]) => [v, k])
  );
  const min = argMin(items.map((id) => Math.abs(get(records, id) - index)));

  const close = get(records, items[min]);

  const [start, end] = index < close ? [index, close] : [close, index];

  const added = new Array(end - start + 1)
    .fill(0)
    .map((_, i) => reverse[i + start]);

  return new Set([...selected, ...added]);
};

const argFact = (compareFn) => (array) =>
  array.map((el, idx) => [el, idx]).reduce(compareFn)[1];

const argMin = argFact((max, el) => (el[0] < max[0] ? el : max));

const get = (records: Records, id: string) => {
  const index = records.get(id);
  if (index !== undefined) {
    return index;
  }

  throw new Error(`record '${id}' not found`);
};

export const removeRange = (
  index: number,
  selected: Set<string>,
  records: Records
) => {
  // filter selections without an index record
  const items = new Set([...selected].filter((i) => records.has(i)));
  const reverse = Object.fromEntries(
    Array.from(records.entries()).map(([k, v]) => [v, k])
  );

  let before = index;
  while (items.has(reverse[before])) {
    before--;
  }
  before += 1;

  let after = index;
  while (items.has(reverse[after])) {
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

  const next = new Set(
    Array.from(items).filter(
      (s) => get(records, s) < start || get(records, s) > end
    )
  );

  for (const id of selected) {
    if (records.has(id)) continue;
    // not in index records so it was not removed, add it back
    next.add(id);
  }

  return next;
};

export default (records: Records) => {
  const setSelected = useSetSelected();
  const ref = useRef<(params: SelectThumbnailData) => Promise<void>>();
  ref.current = useRecoilCallback(
    ({ set, snapshot }) =>
      async (params: SelectThumbnailData) => {
        const { shiftKey, id: sampleId, sample, symbol } = params;
        const current = new Set(await snapshot.getPromise(selectedSamples));
        let selected = new Set(current);
        const selectedObjects = new Map(
          await snapshot.getPromise(selectedSampleObjects)
        );

        const index = get(records, symbol.description);
        if (shiftKey && !selected.has(sampleId)) {
          selected = new Set([
            ...selected,
            ...addRange(index, selected, records),
          ]);
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
    [records, setSelected]
  );
  return ref;
};
