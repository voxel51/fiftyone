import { EntryKind, type SidebarEntry } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { LABELS_GROUP_NAME, labelsExpanded } from "./GroupEntry";
import { visibleLabelSchemas } from "./state";
import { usePresentLabelRows } from "./usePresentLabelRows";
import usePrimitiveEntries from "./usePrimitiveEntries";

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const activeFields = useAtomValue(visibleLabelSchemas);
  const expanded = useAtomValue(labelsExpanded);
  const primitiveEntries = usePrimitiveEntries(activeFields || []);
  const rows = usePresentLabelRows();

  const entries = useMemo(() => {
    if (rows === null) {
      return [{ kind: EntryKind.LOADING }] as SidebarEntry[];
    }

    if (!expanded) {
      return [];
    }

    if (rows.length === 0) {
      return [{ kind: EntryKind.EMPTY_ANNOTATIONS }] as SidebarEntry[];
    }

    return rows.map(({ id, path, frame }) => ({
      kind: EntryKind.LABEL,
      id,
      path,
      frame,
    })) as SidebarEntry[];
  }, [rows, expanded]);

  return [
    [
      { kind: EntryKind.GROUP, name: LABELS_GROUP_NAME },
      ...entries,
      ...primitiveEntries,
    ] as SidebarEntry[],
    () => {},
  ];
};

export default useEntries;
