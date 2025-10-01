import type { SidebarEntry } from "@fiftyone/state";
import { EntryKind } from "@fiftyone/state";
import { getDefaultStore, useAtomValue } from "jotai";
import { useMemo } from "react";
import { labelsExpanded } from "./GroupEntry";
import { labelAtoms, loading } from "./useLabels";

const store = getDefaultStore();

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const showLabels = useAtomValue(labelsExpanded);
  const atoms = useAtomValue(labelAtoms);

  const loadingValue = useAtomValue(loading);
  const labelEntries = useMemo(
    () =>
      atoms.map((atom) => {
        return {
          kind: EntryKind.LABEL,
          atom,
          id: store.get(atom).data._id,
        };
      }),
    [atoms]
  );

  return [
    [
      { kind: EntryKind.GROUP, name: "Labels" },
      ...(showLabels
        ? loadingValue
          ? [{ kind: EntryKind.LOADING }]
          : labelEntries
        : []),
      { kind: EntryKind.GROUP, name: "Primitives" },
    ] as SidebarEntry[],
    () => {},
  ];
};

export default useEntries;
