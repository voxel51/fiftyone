import type { ID } from "@fiftyone/spotlight";
import type { Sample } from "@fiftyone/state";
import {
  selectedSampleObjects,
  selectedSamples,
  selectedMeta,
  useSetSelected,
} from "@fiftyone/state";
import { useRef } from "react";
import { useRecoilCallback } from "recoil";
import type { Records } from "./useRecords";

export interface SelectThumbnailData {
  shiftKey: boolean;
  altKey: boolean;
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
        const { shiftKey, altKey, id: sampleId, sample, symbol } = params;

        const current = new Set(await snapshot.getPromise(selectedSamples));
        const currentObjects = new Map(
          await snapshot.getPromise(selectedSampleObjects)
        );
        const currentMeta = {
          ...(await snapshot.getPromise(selectedMeta)),
        };

        const selectionType = altKey ? "alt" : "default";
        const index = get(records, symbol.description);

        if (shiftKey && !current.has(sampleId)) {
          // Shift-click (or shift+alt-click) range add
          if (current.size === 0) {
            // No anchor — treat as normal click
            current.add(sampleId);
            currentObjects.set(sampleId, sample);
            currentMeta[sampleId] = { type: selectionType };
            set(selectedSamples, current);
            set(selectedSampleObjects, currentObjects);
            set(selectedMeta, currentMeta);
            setSelected(new Set(current));
            return;
          }
          const newSelected = addRange(index, current, records);
          for (const id of newSelected) {
            if (!current.has(id)) {
              currentMeta[id] = { type: selectionType };
            }
          }
          for (const id of newSelected) {
            current.add(id);
          }
          currentObjects.set(sampleId, sample);
        } else if (shiftKey) {
          // Shift-click range remove
          const remaining = removeRange(index, current, records);
          for (const id of current) {
            if (!remaining.has(id)) {
              delete currentMeta[id];
              currentObjects.delete(id);
            }
          }
          current.clear();
          for (const id of remaining) {
            current.add(id);
          }
        } else if (current.has(sampleId)) {
          // Click on any selected sample → deselect
          current.delete(sampleId);
          currentObjects.delete(sampleId);
          delete currentMeta[sampleId];
        } else {
          // Click unselected sample → select with type based on alt key
          current.add(sampleId);
          currentObjects.set(sampleId, sample);
          currentMeta[sampleId] = { type: selectionType };
        }

        set(selectedSamples, current);
        set(selectedSampleObjects, currentObjects);
        set(selectedMeta, currentMeta);
        setSelected(new Set(current));
      },
    [records, setSelected]
  );
  return ref;
};
