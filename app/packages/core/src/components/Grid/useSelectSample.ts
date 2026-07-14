import type { ThumbnailSelectionDetail } from "@fiftyone/looker/src/selection";
import type { Sample } from "@fiftyone/state";
import { selectedSampleObjects, selectedSamples } from "@fiftyone/state";
import type { SelectionType } from "@fiftyone/state";
import { useRef } from "react";
import { useRecoilCallback } from "recoil";
import type { Records } from "./useRecords";

export const addRange = (
  index: number,
  selected: Set<string>,
  records: Records,
) => {
  // filter selections without an index record
  const items = [...selected].filter((i) => records.has(i));
  const reverse = Object.fromEntries(
    Array.from(records.entries()).map(([k, v]) => [v, k]),
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
  records: Records,
) => {
  // filter selections without an index record
  const items = new Set([...selected].filter((i) => records.has(i)));
  const reverse = Object.fromEntries(
    Array.from(records.entries()).map(([k, v]) => [v, k]),
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
      (s) => get(records, s) < start || get(records, s) > end,
    ),
  );

  for (const id of selected) {
    if (records.has(id)) continue;
    // not in index records so it was not removed, add it back
    next.add(id);
  }

  return next;
};

export default (records: Records) => {
  const ref =
    useRef<(params: ThumbnailSelectionDetail<Sample>) => Promise<void>>();
  ref.current = useRecoilCallback(
    ({ set, snapshot }) =>
      async (params: ThumbnailSelectionDetail<Sample>) => {
        const { shiftKey, altKey, id: sampleId, sample, symbol } = params;

        const current = new Map(await snapshot.getPromise(selectedSamples));
        const currentObjects = new Map(
          await snapshot.getPromise(selectedSampleObjects),
        );

        const selectionType: SelectionType = altKey ? "alt" : "default";
        const index = get(records, symbol.description);

        if (shiftKey && !current.has(sampleId)) {
          // Shift-click (or shift+alt-click) range add
          if (current.size === 0) {
            // No anchor — treat as normal click
            current.set(sampleId, selectionType);
            currentObjects.set(sampleId, sample);
            set(selectedSamples, current);
            set(selectedSampleObjects, currentObjects);
            return;
          }
          const currentKeys = new Set(current.keys());
          const newSelected = addRange(index, currentKeys, records);
          for (const id of newSelected) {
            if (!current.has(id)) {
              current.set(id, selectionType);
            }
          }
          currentObjects.set(sampleId, sample);
        } else if (shiftKey) {
          // Shift-click range remove
          const currentKeys = new Set(current.keys());
          const remaining = removeRange(index, currentKeys, records);
          for (const id of currentKeys) {
            if (!remaining.has(id)) {
              current.delete(id);
              currentObjects.delete(id);
            }
          }
        } else if (current.has(sampleId)) {
          // Click on any selected sample → deselect
          current.delete(sampleId);
          currentObjects.delete(sampleId);
        } else {
          // Click unselected sample → select with type based on alt key
          current.set(sampleId, selectionType);
          currentObjects.set(sampleId, sample);
        }

        set(selectedSamples, current);
        set(selectedSampleObjects, currentObjects);
      },
    [records],
  );
  return ref;
};
