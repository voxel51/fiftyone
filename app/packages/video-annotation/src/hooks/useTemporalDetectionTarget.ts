import { useModalSample } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  labelSchemaData,
  useModalSampleFrameRate,
  useTemporalDetectionFieldPaths,
  useVisibleLabelSchemas,
} from "../state/accessors";
import { useSelectedTemporalDetectionField } from "../state/useVideoSelection";

export interface TemporalDetectionTarget {
  /** Sample-level field a new temporal detection is created on, if any. */
  fieldPath: string | null;
  /** Default class from the field's schema, if declared. */
  defaultLabel: string | undefined;
  fps: number | undefined;
  hasUsableFps: boolean;
  canCreate: boolean;
}

/**
 * Resolve where a new temporal detection would be created: the selected
 * TD's field when active, else the first schema-active sample-level field.
 */
export const useTemporalDetectionTarget = (): TemporalDetectionTarget => {
  const modalSample = useModalSample();
  const tdFieldPaths = useTemporalDetectionFieldPaths();
  const visible = useVisibleLabelSchemas();
  const selectedTdField = useSelectedTemporalDetectionField();

  const fieldPath = useMemo(() => {
    const active = tdFieldPaths.filter(
      (p) => !p.startsWith("frames.") && visible.has(p),
    );

    if (selectedTdField && active.includes(selectedTdField)) {
      return selectedTdField;
    }

    return active[0] ?? null;
  }, [tdFieldPaths, visible, selectedTdField]);

  const fps = useModalSampleFrameRate(modalSample);
  const hasUsableFps = Number.isFinite(fps) && fps !== undefined && fps > 0;

  // matches `buildNewLabelData` in core's createNew.ts
  const tdSchema = useAtomValue(labelSchemaData(fieldPath ?? ""));
  const schemaDefault = tdSchema?.label_schema?.default;
  const defaultLabel: string | undefined =
    typeof schemaDefault === "string"
      ? schemaDefault
      : tdSchema?.label_schema?.classes?.[0];

  return {
    fieldPath,
    defaultLabel,
    fps,
    hasUsableFps,
    canCreate: !!fieldPath && hasUsableFps,
  };
};
