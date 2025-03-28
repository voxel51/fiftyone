import type { State } from "@fiftyone/state";

export const toLabelMap = (
  labels: State.SelectedLabel[]
): State.SelectedLabelMap =>
  Object.fromEntries(labels.map(({ labelId, ...rest }) => [labelId, rest]));

export const hasSetDiff = <T>(a: Set<T>, b: Set<T>) => {
  return new Set([...a].filter((e) => !b.has(e))).size > 0;
};

export const hasSetInt = <T>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => b.has(e))).size > 0;

export const toIds = (labels: State.SelectedLabel[]) =>
  new Set([...labels].map(({ labelId }) => labelId));
