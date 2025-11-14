import type { SidebarEntry } from "@fiftyone/state";
import { EntryKind } from "@fiftyone/state";
import { getDefaultStore, useAtomValue } from "jotai";
import { useMemo } from "react";
import { labelsExpanded } from "./GroupEntry";
import { LabelsState, labelAtoms, labelsState } from "./useLabels";

const store = getDefaultStore();

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const showLabels = useAtomValue(labelsExpanded);
  const atoms = useAtomValue(labelAtoms);

  const state = useAtomValue(labelsState);
  const labelEntries = useMemo(
    () =>
      atoms.map((atom) => {
        return {
          kind: EntryKind.LABEL,
          atom,
          id: store.get(atom).overlay.id,
        };
      }),
    [atoms]
  );

  return [
    [
      { kind: EntryKind.GROUP, name: "Labels" },
      ...(showLabels
        ? state !== LabelsState.COMPLETE
          ? [{ kind: EntryKind.LOADING }]
          : labelEntries
        : []),
    ] as SidebarEntry[],
    () => {},
  ];
};

export default useEntries;
