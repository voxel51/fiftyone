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

<<<<<<< HEAD
    const labelsByField: Record<
      string,
      Array<{ atom: (typeof atoms)[0]; id: string; label: string }>
    > = {};

    for (const atomItem of atoms) {
      const labelData = store.get(atomItem);
      const field = labelData.path;
      if (!labelsByField[field]) {
        labelsByField[field] = [];
      }
      labelsByField[field].push({
        atom: atomItem,
        id: labelData.overlay.id,
        label: labelData.data?.label ?? "",
      });
    }

    for (const field in labelsByField) {
      labelsByField[field].sort((a, b) => a.label.localeCompare(b.label));
    }

    const result: SidebarEntry[] = [];
    const fieldsToShow = activeFields ?? Object.keys(labelsByField);
    for (const field of fieldsToShow) {
      const fieldLabels = labelsByField[field];
      if (!fieldLabels?.length) continue;

      for (const { atom, id } of fieldLabels) {
        result.push({ kind: EntryKind.LABEL, atom, id });
      }
    }

    if (result.length === 0) {
=======
    if (rows.length === 0) {
>>>>>>> main
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
