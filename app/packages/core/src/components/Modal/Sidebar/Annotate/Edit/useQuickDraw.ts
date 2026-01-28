import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { countBy, maxBy } from "lodash";
import { labels, labelsByPath } from "../useLabels";
import { labelSchemaData, fieldType } from "../state";
import {
  quickDrawActiveAtom,
  currentAnnotationModeAtom,
  defaultField,
  lastUsedFieldByTypeAtom,
  lastUsedLabelByFieldAtom,
} from "./state";

import type { LabelType } from "./state";

/**
 * Centralized hook for managing quick draw mode state and operations.
 *
 * This hook encapsulates all quick draw functionality including:
 * - Mode activation/deactivation
 * - Auto-assignment logic for fields and labels
 * - Last-used value tracking
 *
 * Following FiftyOne guidelines, this hook is the ONLY public interface
 * for interacting with quick draw atoms. Atoms are implementation details
 * and should not be accessed directly by consumers.
 */
export const useQuickDraw = () => {
  const [quickDrawActive, setQuickDrawActive] = useAtom(quickDrawActiveAtom);
  const [currentMode, setCurrentMode] = useAtom(currentAnnotationModeAtom);
  const labelsMap = useAtomValue(labelsByPath);
  const allLabels = useAtomValue(labels);

  /**
   * Enable quick draw mode with the specified annotation type.
   * Sets both the active flag and current mode.
   */
  const enableQuickDraw = useCallback(
    (mode: "Classification" | "Detection") => {
      setCurrentMode(mode);
      setQuickDrawActive(true);
    },
    [setCurrentMode, setQuickDrawActive]
  );

  /**
   * Disable quick draw mode.
   * Resets both the active flag and current mode to their default values.
   */
  const disableQuickDraw = useCallback(() => {
    setCurrentMode(null);
    setQuickDrawActive(false);
    // Note: lastUsedFieldByTypeAtom and lastUsedLabelByFieldAtom will be
    // garbage collected when no longer referenced. We rely on quickDrawActive
    // flag to determine whether to use last-used values.
  }, [setCurrentMode, setQuickDrawActive]);

  /**
   * Get the auto-assigned field path for a label type.
   *
   * Auto-assignment priority:
   * 1. Last-used field for this type (if in quick draw mode)
   * 2. Field with the most labels of this type
   * 3. Default field for this type
   *
   * Returns null if no field is available.
   */
  const getAutoAssignedField = useCallback(
    (type: LabelType): string | null => {
      const store = getDefaultStore();

      // In quick draw mode, check for last-used field
      if (quickDrawActive) {
        const lastUsedField = store.get(lastUsedFieldByTypeAtom(type));
        if (lastUsedField) {
          return lastUsedField;
        }
      }

      // Find the field with the most labels of this type
      let maxCount = 0;
      let fieldWithMostLabels: string | null = null;

      for (const [fieldPath, fieldLabels] of Object.entries(labelsMap)) {
        // Check if this field is of the correct type
        const typeStr = store.get(fieldType(fieldPath));
        const IS_CLASSIFICATION = new Set([
          "Classification",
          "Classifications",
        ]);
        const IS_DETECTION = new Set(["Detection", "Detections"]);

        const matchesType =
          (type === "Classification" && IS_CLASSIFICATION.has(typeStr || "")) ||
          (type === "Detection" && IS_DETECTION.has(typeStr || ""));

        if (matchesType && fieldLabels.length > maxCount) {
          maxCount = fieldLabels.length;
          fieldWithMostLabels = fieldPath;
        }
      }

      if (fieldWithMostLabels) {
        return fieldWithMostLabels;
      }

      // Fallback to default field
      const field = store.get(defaultField(type));
      return field;
    },
    [quickDrawActive, labelsMap]
  );

  /**
   * Get the auto-assigned label value (class) for a label type and field.
   *
   * Auto-assignment priority:
   * 1. Last-used label for this field (if in quick draw mode)
   * 2. Most common label across all labels of this type
   * 3. First class in the schema for the assigned field
   *
   * Returns null if no label value can be determined.
   */
  const getAutoAssignedLabel = useCallback(
    (type: LabelType, fieldPath: string): string | null => {
      const store = getDefaultStore();

      // In quick draw mode, check for last-used label for this field
      if (quickDrawActive) {
        const lastUsedLabel = store.get(lastUsedLabelByFieldAtom(fieldPath));
        if (lastUsedLabel) {
          return lastUsedLabel;
        }
      }

      // Find most common label across ALL labels of this type (all fields)
      const IS_CLASSIFICATION = new Set(["Classification", "Classifications"]);
      const IS_DETECTION = new Set(["Detection", "Detections"]);

      const relevantLabels = allLabels.filter((label) => {
        const labelFieldType = store.get(fieldType(label.path));
        return (
          (type === "Classification" &&
            IS_CLASSIFICATION.has(labelFieldType || "")) ||
          (type === "Detection" && IS_DETECTION.has(labelFieldType || ""))
        );
      });

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

      // Fallback to first class in schema for the assigned field
      const schemaData = store.get(labelSchemaData(fieldPath));
      const classes = schemaData?.label_schema?.classes;
      if (classes && classes.length > 0) {
        return classes[0];
      }

      return null;
    },
    [allLabels, quickDrawActive]
  );

  /**
   * Track the last-used field and label values after a successful save.
   * This updates the auto-assignment state for future label creation.
   *
   * Should be called after each label is successfully saved in quick draw mode.
   */
  const trackLastUsed = useCallback(
    (type: LabelType, fieldPath: string, labelValue?: string) => {
      const store = getDefaultStore();

      // Update last-used field for this type
      store.set(lastUsedFieldByTypeAtom(type), fieldPath);

      // Update last-used label for this field (if label exists)
      if (labelValue) {
        store.set(lastUsedLabelByFieldAtom(fieldPath), labelValue);
      }
    },
    []
  );

  return useMemo(
    () => ({
      // State (read-only)
      quickDrawActive,
      currentMode,

      // Mode control (for UI components)
      enableQuickDraw,
      disableQuickDraw,

      // Auto-assignment (for useCreate)
      getAutoAssignedField,
      getAutoAssignedLabel,

      // Tracking (for useSave)
      trackLastUsed,
    }),
    [
      quickDrawActive,
      currentMode,
      enableQuickDraw,
      disableQuickDraw,
      getAutoAssignedField,
      getAutoAssignedLabel,
      trackLastUsed,
    ]
  );
};
