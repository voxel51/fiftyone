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
 * One `{id, path, frame?}` row per present in-scope label at the current
 * playhead, ordered by active field then label name; for a video this is the
 * current frame plus in-support temporal detections. `null` while the engine
 * isn't ready, an empty array once ready with no labels.
 */
export const usePresentLabelRows = (): LabelRow[] | null => {
  const engine = useAnnotationEngine();
  const activeFields = useAtomValue(visibleLabelSchemas);
  const sampleId = useActiveAnnotationSampleId();
  const ready = useAnnotationLabelsReady();

  return useTemporal(
    engine,
    (t): LabelRow[] | null => {
      // while the sample's store is unregistered or mid-seed, an empty present
      // read is "loading", not "no labels"
      if (!ready || !engine.isSampleReady(sampleId)) {
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
