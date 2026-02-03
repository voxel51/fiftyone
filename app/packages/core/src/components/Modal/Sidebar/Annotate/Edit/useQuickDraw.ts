import { DETECTION } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { countBy, maxBy } from "lodash";
import { useCallback, useMemo } from "react";
import { fieldType, labelSchemaData } from "../state";
import { labelsByPath } from "../useLabels";
import { defaultField } from "./state";

/**
 * Flag to track if quick draw mode is active.
 * When true, detection labels are created in quick succession without exiting after each save.
 *
 * This atom is exported to allow inspection from non-React code.
 * This atom should not be used in React code.
 */
export const _dangerousQuickDrawActiveAtom = atom<boolean>(false);

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

const detectionTypes = new Set(["Detection", "Detections"]);

/**
 * Centralized hook for managing quick draw mode state and operations.
 */
export const useQuickDraw = () => {
  const [quickDrawActive, setQuickDrawActive] = useAtom(
    _dangerousQuickDrawActiveAtom
  );
  const [lastUsedField, setLastUsedField] = useAtom(lastUsedDetectionFieldAtom);
  const labelsMap = useAtomValue(labelsByPath);
  const defaultDetectionField = useAtomValue(defaultField(DETECTION));

  /**
   * Getter which wraps {@link fieldType} atom family.
   */
  const getFieldType = useAtomCallback(
    useCallback((get, _set, path: string) => get(fieldType(path)), [])
  );

  /**
   * Getter whcih wraps {@link lastUsedLabelByFieldAtom} atom family.
   */
  const getLastUsedLabel = useAtomCallback(
    useCallback(
      (get, _set, path: string) => get(lastUsedLabelByFieldAtom(path)),
      []
    )
  );

  /**
   * Setter which wraps {@link lastUsedLabelByFieldAtom} atom family.
   */
  const setLastUsedLabel = useAtomCallback(
    useCallback(
      (_get, set, path: string, label: string) =>
        set(lastUsedLabelByFieldAtom(path), label),
      []
    )
  );

  /**
   * Getter which wraps {@link labelSchemaData} atom family.
   */
  const getLabelSchema = useAtomCallback(
    useCallback((get, _set, path: string) => get(labelSchemaData(path)), [])
  );

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
    if (quickDrawActive && lastUsedField) {
      return lastUsedField;
    }

    let maxCount = 0;
    let fieldWithMostLabels: string | null = null;

    for (const [fieldPath, fieldLabels] of Object.entries(labelsMap)) {
      const typeStr = getFieldType(fieldPath);

      if (detectionTypes.has(typeStr || "") && fieldLabels.length > maxCount) {
        maxCount = fieldLabels.length;
        fieldWithMostLabels = fieldPath;
      }
    }

    if (fieldWithMostLabels) {
      return fieldWithMostLabels;
    }

    // Fallback to default detection field
    return defaultDetectionField;
  }, [
    defaultDetectionField,
    getFieldType,
    labelsMap,
    lastUsedField,
    quickDrawActive,
  ]);

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
      const lastUsedLabel = getLastUsedLabel(fieldPath);

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
      const schemaData = getLabelSchema(fieldPath);
      const classes = schemaData?.label_schema?.classes;
      if (classes && classes.length > 0) {
        return classes[0];
      }

      return null;
    },
    [getLabelSchema, getLastUsedLabel, labelsMap]
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
        setLastUsedLabel(fieldPath, labelValue);
      }
    },
    [setLastUsedField, setLastUsedLabel]
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
