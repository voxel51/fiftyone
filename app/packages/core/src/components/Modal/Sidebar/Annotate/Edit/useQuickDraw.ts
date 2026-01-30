import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { countBy, maxBy } from "lodash";
import { DETECTION } from "@fiftyone/utilities";
import { labels, labelsByPath } from "../useLabels";
import { labelSchemaData, fieldType } from "../state";
import {
  quickDrawActiveAtom,
  lastUsedDetectionFieldAtom,
  defaultField,
  lastUsedLabelByFieldAtom,
} from "./state";

/**
 * Centralized hook for managing quick draw mode state and operations.
 */
export const useQuickDraw = () => {
  const [quickDrawActive, setQuickDrawActive] = useAtom(quickDrawActiveAtom);
  const [lastUsedField, setLastUsedField] = useAtom(lastUsedDetectionFieldAtom);
  const labelsMap = useAtomValue(labelsByPath);
  const allLabels = useAtomValue(labels);

  /**
   * Enable quick draw mode for Detection annotations.
   */
  const enableQuickDraw = useCallback(() => {
    setQuickDrawActive(true);
  }, [setQuickDrawActive]);

  /**
   * Disable quick draw mode.
   * Resets the active flag to false. Last-used field and label atoms
   */
  const disableQuickDraw = useCallback(() => {
    setQuickDrawActive(false);
  }, [setQuickDrawActive]);

  /**
   * Get the auto-assigned detection field path.
   *
   * Auto-assignment priority:
   * 1. Last-used detection field (if in quick draw mode and previously set)
   * 2. Field with the most detection labels
   * 3. Default detection field
   *
   * Returns null if no detection field is available.
   */
  const getQuickDrawDetectionField = useCallback((): string | null => {
    const store = getDefaultStore();
    const lastUsedField = store.get(lastUsedDetectionFieldAtom);

    if (quickDrawActive && lastUsedField) {
      return lastUsedField;
    }

    let maxCount = 0;
    let fieldWithMostLabels: string | null = null;

    const IS_DETECTION = new Set(["Detection", "Detections"]);

    for (const [fieldPath, fieldLabels] of Object.entries(labelsMap)) {
      const typeStr = store.get(fieldType(fieldPath));

      if (IS_DETECTION.has(typeStr || "") && fieldLabels.length > maxCount) {
        maxCount = fieldLabels.length;
        fieldWithMostLabels = fieldPath;
      }
    }

    if (fieldWithMostLabels) {
      return fieldWithMostLabels;
    }

    // Fallback to default detection field
    const field = store.get(defaultField(DETECTION));
    return field;
  }, [quickDrawActive, labelsMap]);

  /**
   * Get the auto-assigned label value (class) for a detection field.
   * Quick draw only works with Detection labels.
   *
   * Auto-assignment priority:
   * 1. Last-used label for this field (if in quick draw mode)
   * 2. Most common label for this specific field
   * 3. First class in the schema for the field
   *
   * Returns null if no label value can be determined.
   */
  const getQuickDrawDetectionLabel = useCallback(
    (fieldPath: string): string | null => {
      const store = getDefaultStore();
      const lastUsedLabel = store.get(lastUsedLabelByFieldAtom(fieldPath));

      if (lastUsedLabel) {
        return lastUsedLabel;
      }

      // Get labels specific to this field path
      const fieldLabels = labelsMap[fieldPath] || [];
      const relevantLabels = fieldLabels.filter((label) => label.data.label);

      if (relevantLabels.length > 0) {
        const labelCounts = countBy(
          relevantLabels,
          (label) => label.data.label
        );
        const mostCommonEntry = maxBy(
          Object.entries(labelCounts),
          ([_, count]) => count
        );

        if (mostCommonEntry && mostCommonEntry[0]) {
          return mostCommonEntry[0];
        }
      }

      // Fallback to first class in schema for the field
      const schemaData = store.get(labelSchemaData(fieldPath));
      const classes = schemaData?.label_schema?.classes;
      if (classes && classes.length > 0) {
        return classes[0];
      }

      return null;
    },
    [labelsMap, quickDrawActive]
  );

  /**
   * Track the last-used detection field and label value after a successful save.
   * This updates the auto-assignment state for future label creation in quick draw mode.
   *
   * Should be called after each detection is successfully saved in quick draw mode.
   */
  const trackLastUsedDetection = useCallback(
    (fieldPath: string, labelValue?: string) => {
      // Update last-used detection field
      setLastUsedField(fieldPath);

      // Update last-used label for this field (if label exists)
      if (labelValue) {
        const store = getDefaultStore();
        store.set(lastUsedLabelByFieldAtom(fieldPath), labelValue);
      }
    },
    [setLastUsedField]
  );

  /**
   * Get the appropriate label value when switching fields in QuickDraw mode.
   * This determines what label should be pre-selected for the new field.
   *
   * @param newFieldPath - The field path being switched to
   * @returns The label value to use, or null if none available
   */
  const getLabelForFieldSwitch = useCallback(
    (newFieldPath: string): string | null => {
      if (!quickDrawActive) {
        return null;
      }

      return getQuickDrawDetectionLabel(newFieldPath);
    },
    [quickDrawActive, getQuickDrawDetectionLabel]
  );

  return useMemo(
    () => ({
      // State (read-only)
      quickDrawActive,
      lastUsedDetectionField: lastUsedField,

      // Mode control (for UI components)
      enableQuickDraw,
      disableQuickDraw,

      // Auto-assignment (for useCreate)
      getQuickDrawDetectionField,
      getQuickDrawDetectionLabel,

      // Tracking (for useSave)
      trackLastUsedDetection,

      // Field switching (for Field component)
      getLabelForFieldSwitch,
    }),
    [
      quickDrawActive,
      lastUsedField,
      enableQuickDraw,
      disableQuickDraw,
      getQuickDrawDetectionField,
      getQuickDrawDetectionLabel,
      trackLastUsedDetection,
      getLabelForFieldSwitch,
    ]
  );
};
