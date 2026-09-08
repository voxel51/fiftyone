import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useTemporal,
} from "@fiftyone/annotation";
import { LabelType } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { visibleLabelSchemas } from "./state";
import { useAnnotationLabelsReady } from "./useLabels";

export type LabelRow = { id: string; path: string; frame?: number };

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
        row.frame === b[index].frame,
    )
  );
};

/**
 * The present-label rows for the active fields at the current playhead — the
 * single source of truth for both the sidebar list and its count. One row per
 * present in-scope label, ordered by field then label name. For an image (pool)
 * sample presence is the whole pool; for a video (frame view) it is the current
 * frame's labels plus any in-support temporal detections, and the list
 * re-derives as the playhead scrubs — so a count built from it reflects the
 * CURRENT FRAME, not the whole clip. Returns `null` while the engine isn't ready
 * (loading gate); an empty array once ready with no labels. Rows carry a
 * `{id, path, frame?}` ref that {@link LabelEntry} reads the label at.
 *
 * Lives in its own module (not `useEntries`) so the sidebar count can reuse it
 * without `GroupEntry` ↔ `useEntries` forming an import cycle.
 */
export const usePresentLabelRows = (): LabelRow[] | null => {
  const engine = useAnnotationEngine();
  const activeFields = useAtomValue(visibleLabelSchemas);
  const sampleId = useActiveAnnotationSampleId();
  const ready = useAnnotationLabelsReady();

  return useTemporal(
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
        (a, b) => activeFields.indexOf(a) - activeFields.indexOf(b),
      );
      for (const path of enginePaths) {
        const fieldRows = byField[path];

        // field -> label -> id, so equal-label rows have a stable order
        fieldRows.sort(
          (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id),
        );
        for (const { id, frame } of fieldRows) {
          result.push({ id, path, frame });
        }
      }

      return result;
    },
    sameRows,
  );
};

/**
 * Count of present labels for the active fields at the current playhead —
 * matches the sidebar list. `null` while the engine isn't ready (loading).
 */
export const usePresentLabelCount = (): number | null => {
  const rows = usePresentLabelRows();
  return rows === null ? null : rows.length;
};
