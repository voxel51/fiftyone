import { DETECTION } from "@fiftyone/utilities";
import { atom, getDefaultStore, useAtom, useAtomValue } from "jotai";
import { atomFamily } from "jotai/utils";
import { countBy, maxBy } from "lodash";
import { useCallback, useMemo } from "react";
import { fieldType, labelSchemaData } from "../state";
import { labelsByPath } from "../useLabels";
import { defaultField } from "./state";

// Quick draw annotation mode state
// Use the useQuickDraw hook to interact with quick draw functionality.

/**
 * Flag to track if quick draw mode is active.
 * When true, detection labels are created in quick succession without exiting after each save.
 */
export const quickDrawActiveAtom = atom<boolean>(false);

/**
 * Tracks the last-used detection field path in quick draw mode.
 * Examples: "ground_truth.detections", "predictions.detections"
 * Used to remember which detection field the user was annotating.
 */
const lastUsedDetectionFieldAtom = atom<string | null>(null);

/**
 * Tracks the last-used label value (class) for each field path.
 * Used for auto-assignment when creating new labels in quick draw mode.
 */
const lastUsedLabelByFieldAtom = atomFamily((field: string) =>
  atom<string | null>(null)
);

/**
 * Centralized hook for managing quick draw mode state and operations.
 */
export const useQuickDraw = () => {
  const [quickDrawActive, setQuickDrawActive] = useAtom(quickDrawActiveAtom);
  const [lastUsedField, setLastUsedField] = useAtom(lastUsedDetectionFieldAtom);
  const labelsMap = useAtomValue(labelsByPath);

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
   * This function manages both the atom state and overlay updates, bypassing the
   * normal currentField setter which would wipe out the label data.
   *
   * @param newFieldPath - The new field path to switch to
   * @param currentLabel - The current label atom/data
   * @param setCurrent - Setter function for the current atom
   * @returns The complete updated data object
   */
  const handleQuickDrawFieldChange = useCallback(
    (newFieldPath: string, currentLabel: any, setCurrent: any): any => {
      if (!quickDrawActive || !currentLabel) {
        return null;
      }

      const newLabelValue = getQuickDrawDetectionLabel(newFieldPath);

      const newData = {
        _id: currentLabel.data._id,
        ...(newLabelValue && { label: newLabelValue }),
      };

      currentLabel.overlay?.updateField(newFieldPath);
      currentLabel.overlay?.updateLabel(newData);

      setCurrent({ ...currentLabel, path: newFieldPath, data: newData });

      return newData;
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
      handleQuickDrawFieldChange,
    }),
    [
      quickDrawActive,
      lastUsedField,
      enableQuickDraw,
      disableQuickDraw,
      getQuickDrawDetectionField,
      getQuickDrawDetectionLabel,
      trackLastUsedDetection,
      handleQuickDrawFieldChange,
    ]
  );
};
