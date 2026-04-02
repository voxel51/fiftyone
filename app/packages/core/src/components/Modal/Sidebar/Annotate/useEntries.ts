import { EntryKind, type SidebarEntry } from "@fiftyone/state";
import { useMemo } from "react";
import { LABELS_GROUP_NAME } from "./GroupEntry";
import {
  LabelsLoadingState,
  useAnnotationLabels,
  useAnnotationSelector,
  useVisibleLabelSchemas,
} from "./redux/hooks";
import usePrimitiveEntries from "./usePrimitiveEntries";

const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const labels = useAnnotationLabels();
  const activeFields = useVisibleLabelSchemas();
  const loadingState = useAnnotationSelector(
    (s) => s.annotation.labelsLoadingState
  );
  const primitiveEntries = usePrimitiveEntries(activeFields || []);
  const expanded = useAnnotationSelector((s) => s.annotation.labelsExpanded);

  const entries = useMemo(() => {
    if (loadingState !== LabelsLoadingState.COMPLETE) {
      return [{ kind: EntryKind.LOADING }] as SidebarEntry[];
    }

    if (!expanded) {
      return [];
    }

    const labelsByField: Record<
      string,
      Array<{ overlayId: string; label: string }>
    > = {};

    for (const l of labels) {
      if (!labelsByField[l.path]) {
        labelsByField[l.path] = [];
      }
      labelsByField[l.path].push({
        overlayId: l.overlayId,
        label: l.label ?? "",
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

      for (const { overlayId } of fieldLabels) {
        result.push({
          kind: EntryKind.LABEL,
          overlayId,
          id: overlayId,
        } as SidebarEntry);
      }
    }

    if (result.length === 0) {
      return [{ kind: EntryKind.EMPTY_ANNOTATIONS }] as SidebarEntry[];
    }

    return result as SidebarEntry[];
  }, [labels, activeFields, loadingState, expanded]);

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
