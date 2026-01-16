import type { SidebarEntry } from "@fiftyone/state";
import { EntryKind } from "@fiftyone/state";
import { getDefaultStore, useAtomValue } from "jotai";
import { useMemo } from "react";
import { labelsExpanded } from "./GroupEntry";
import { activeLabelSchemas } from "./state";
import { LabelsState, labelAtoms, labelsState } from "./useLabels";

const store = getDefaultStore();

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const atoms = useAtomValue(labelAtoms);
  const activeFields = useAtomValue(activeLabelSchemas);
  const state = useAtomValue(labelsState);
  const expanded = useAtomValue(labelsExpanded);

  const entries = useMemo(() => {
    if (state !== LabelsState.COMPLETE) {
      return [{ kind: EntryKind.LOADING }] as SidebarEntry[];
    }

    const labelsByField: Record<
      string,
      Array<{ atom: typeof atoms[0]; id: string; label: string }>
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

    return result as SidebarEntry[];
  }, [atoms, activeFields, state]);

  return [
    [
      { kind: EntryKind.GROUP, name: "Labels" },
      ...(expanded ? entries : []),
    ] as SidebarEntry[],
    () => {},
  ];
};

export default useEntries;
