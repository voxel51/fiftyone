import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useTemporal,
} from "@fiftyone/annotation";
import { EntryKind, type SidebarEntry } from "@fiftyone/state";
import { LabelType } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { LABELS_GROUP_NAME, labelsExpanded } from "./GroupEntry";
import { visibleLabelSchemas } from "./state";
import { useAnnotationLabelsReady } from "./useLabels";
import usePrimitiveEntries from "./usePrimitiveEntries";

type LabelRow = { id: string; path: string; frame?: number };

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
      (row, index) =>
        row.id === b[index].id &&
        row.path === b[index].path &&
        row.frame === b[index].frame
    )
  );
};

/**
 * The sidebar label rows, derived from the engine's temporal presence — one row
 * per present in-scope label, ordered by field then label name. For an image
 * (pool) sample presence is the whole pool; for a video (frame view) it is the
 * current frame's labels plus any in-support temporal detections, and the list
 * re-derives as the playhead scrubs. Returns `null` while the engine isn't ready
 * yet (loading gate); an empty array once ready with no labels (empty state).
 * Rows carry a `{id, path, frame?}` ref — {@link LabelEntry} reads the label
 * per-component at that ref.
 */
const useEntries = (): [SidebarEntry[], (entries: SidebarEntry[]) => void] => {
  const engine = useAnnotationEngine();
  const activeFields = useAtomValue(visibleLabelSchemas);
  const sampleId = useActiveAnnotationSampleId();
  const ready = useAnnotationLabelsReady();
  const expanded = useAtomValue(labelsExpanded);
  const primitiveEntries = usePrimitiveEntries(activeFields || []);

  const rows = useTemporal(
    engine,
    (t): LabelRow[] | null => {
      if (!ready) {
        return null;
      }

      const active = new Set(activeFields);
      const byField: Record<
        string,
        Array<{ id: string; label: string; frame?: number }>
      > = {};

      for (const ref of t.getPresent()) {
        // refs and the active set share the schema namespace — a frame field is
        // `frames.<field>` on both sides, so match the ref path directly.
        if (ref.sample !== sampleId || !active.has(ref.path)) {
          continue;
        }

        if (engine.getLabelType(ref.path) === LabelType.Unknown) {
          continue;
        }

        const data = engine.getLabel(ref);
        if (!data) {
          continue;
        }

        (byField[ref.path] ??= []).push({
          id: ref.instanceId,
          label: (data.label as string) ?? "",
          frame: ref.frame,
        });
      }

      // order by the active-field order of each present field; rows carry the
      // path `LabelEntry` resolves the label at.
      const result: LabelRow[] = [];
      const enginePaths = Object.keys(byField).sort(
        (a, b) => activeFields.indexOf(a) - activeFields.indexOf(b)
      );
      for (const path of enginePaths) {
        const fieldRows = byField[path];

        // field -> label -> id, so equal-label rows have a stable order
        fieldRows.sort(
          (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
        );
        for (const { id, frame } of fieldRows) {
          result.push({ id, path, frame });
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
