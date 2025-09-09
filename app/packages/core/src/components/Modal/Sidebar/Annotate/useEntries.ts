import type { SidebarEntry } from "@fiftyone/state";
import { EntryKind } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { labelsExpanded } from "./GroupEntry";
import { labels, loading } from "./useLabels";

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const showLabels = useAtomValue(labelsExpanded);
  const labelValues = useAtomValue(labels);

  const loadingValue = useAtomValue(loading);
  const labelEntries = useMemo(
    () => labelValues.map((label) => ({ ...label, kind: EntryKind.LABEL })),
    [labelValues]
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
