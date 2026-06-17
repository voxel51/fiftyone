import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useEngineSelector,
} from "@fiftyone/annotation";
import { EntryKind, type SidebarEntry } from "@fiftyone/state";
import { LabelType } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { LABELS_GROUP_NAME, labelsExpanded } from "./GroupEntry";
import { visibleLabelSchemas } from "./state";
import { useAnnotationLabelsReady } from "./useLabels";
import usePrimitiveEntries from "./usePrimitiveEntries";

type LabelRow = { id: string; path: string };

const sameRows = (a: LabelRow[] | null, b: LabelRow[] | null): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return a === b;
  }

  return (
    a.length === b.length &&
    a.every(
      (row, index) => row.id === b[index].id && row.path === b[index].path
    )
  );
};

/**
 * The sidebar label rows, derived directly from the annotation engine — one row
 * per in-scope engine label, ordered by field then label name. Returns `null`
 * while the engine isn't ready yet (loading gate); an empty array once ready
 * with no labels (empty state). Rows carry a `{id, path}` ref, not a mirror
 * atom — {@link LabelEntry} reads the label per-component by ref.
 */
const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const engine = useAnnotationEngine();
  const activeFields = useAtomValue(visibleLabelSchemas);
  const sampleId = useActiveAnnotationSampleId();
  const ready = useAnnotationLabelsReady();
  const expanded = useAtomValue(labelsExpanded);
  const primitiveEntries = usePrimitiveEntries(activeFields || []);

  const rows = useEngineSelector(
    engine,
    (e): LabelRow[] | null => {
      if (!ready) {
        return null;
      }

      const byField: Record<string, Array<{ id: string; label: string }>> = {};

      for (const path of activeFields) {
        if (e.getLabelType(path) === LabelType.Unknown) {
          continue;
        }

        for (const data of e.listLabels({ sample: sampleId, path })) {
          (byField[path] ??= []).push({
            id: data._id,
            label: (data.label as string) ?? "",
          });
        }
      }

      const result: LabelRow[] = [];
      for (const path of activeFields) {
        const fieldRows = byField[path];
        if (!fieldRows?.length) {
          continue;
        }

        // field -> label -> id, so equal-label rows have a stable order
        fieldRows.sort(
          (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
        );
        for (const { id } of fieldRows) {
          result.push({ id, path });
        }
      }

      return result;
    },
    sameRows
  );

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

    return rows.map(({ id, path }) => ({
      kind: EntryKind.LABEL,
      id,
      path,
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
