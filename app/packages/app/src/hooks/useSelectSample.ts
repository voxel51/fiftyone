import Flashlight from "@fiftyone/flashlight";
import { useRecoilTransaction_UNSTABLE } from "recoil";
import { selectedSamples } from "../recoil/atoms";
import { useSetSelected } from "../utils/hooks";

const argFact =
  <T extends unknown>(compareFn) =>
  (array: T[]) =>
    array.map((el, idx) => [el, idx]).reduce<T>(compareFn, array[0])[1];

const argMin = argFact((max, el) => (el[0] < max[0] ? el : max));

const addRange = (
  index: number,
  items: string[],
  map: { [key: string]: number }
) => {
  const reverse = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [v, k])
  );

  const close =
    map[items[argMin(items.map((id) => Math.abs(map[id] - index)))]];

  const [start, end] = index < close ? [index, close] : [close, index];

  const added = new Array(end - start + 1)
    .fill(0)
    .map((_, i) => reverse[i + start]);

  return new Set([...items, ...added]);
};

const removeRange = (
  index: number,
  selected: Set<string>,
  map: { [key: string]: number }
) => {
  const reverse = Object.fromEntries(
    Object.entries(map).map(([k, v]) => [v, k])
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

  return new Set([...selected].filter((s) => map[s] < start || map[s] > end));
};

export interface SelectThumbnailData {
  shiftKey: boolean;
  sampleId: string;
}

export default () => {
  const setSelected = useSetSelected();

  return useRecoilTransaction_UNSTABLE(
    ({ set, get }) =>
      async (
        flashlight: Flashlight<number>,
        { shiftKey, sampleId }: SelectThumbnailData
      ) => {
        const selected = new Set(get(selectedSamples));
        const items = [...selected];
        const map = flashlight.itemIndexes;
        const index = map[sampleId];

        if (shiftKey && !selected.has(sampleId)) {
          addRange(index, items, map);
        } else if (shiftKey) {
          removeRange(index, selected, map);
        } else {
          selected.has(sampleId)
            ? selected.delete(sampleId)
            : selected.add(sampleId);
        }

        set(selectedSamples, selected);
        setSelected([...selected]);
      },
    [setSelected]
  );
};
