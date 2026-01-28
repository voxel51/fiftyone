import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { countBy, maxBy } from "lodash";
import { labels, labelsByPath } from "../useLabels";
import { labelSchemaData, fieldType } from "../state";
import {
  quickDrawActiveAtom,
  defaultField,
  lastUsedFieldByTypeAtom,
  lastUsedLabelByFieldAtom,
  type LabelType,
} from "./state";

/**
 * Hook for auto-assigning field and label values when creating new labels
 * in quick draw mode.
 *
 * Auto-assignment logic:
 * - Field: Use last-used field for this type, fallback to defaultField
 * - Label: Use last-used label for this field, fallback to most common label
 *   in sidebar, fallback to first class in schema
 */
export const useAutoAssignment = () => {
  const labelsMap = useAtomValue(labelsByPath);
  const allLabels = useAtomValue(labels);
  const isQuickDrawMode = useAtomValue(quickDrawActiveAtom);

  /**
   * Get the auto-assigned field path for a label type.
   * Prioritizes the field with the most labels of this type.
   * Returns null if no field is available.
   */
  const getAutoAssignedField = useCallback(
    (type: LabelType): string | null => {
      const store = getDefaultStore();

      // In quick draw mode, check for last-used field
      if (isQuickDrawMode) {
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
        const IS_CLASSIFICATION = new Set(["Classification", "Classifications"]);
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
    [isQuickDrawMode, labelsMap]
  );

  /**
   * Get the auto-assigned label value (class) for a label type.
   * Looks at ALL visible labels of this type across all fields.
   * Returns null if no label value can be determined.
   */
  const getAutoAssignedLabel = useCallback(
    (type: LabelType, fieldPath: string): string | null => {
      const store = getDefaultStore();

      // In quick draw mode, check for last-used label for this field
      if (isQuickDrawMode) {
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
        const labelCounts = countBy(relevantLabels, (label) => label.data.label);
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
    [allLabels, isQuickDrawMode]
  );

  /**
   * Update the last-used field and label values after a successful save.
   */
  const updateLastUsed = useCallback(
    (type: LabelType, fieldPath: string, labelValue: string | undefined) => {
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

  /**
   * Clear all last-used tracking state.
   * Called when exiting quick draw mode.
   */
  const clearLastUsed = useCallback(() => {
    const store = getDefaultStore();

    // Note: atomFamily atoms are not easily clearable
    // They will be garbage collected when no longer referenced
    // For now, we rely on the quickDrawActive flag
    // to determine whether to use last-used values
  }, []);

  return useMemo(
    () => ({
      getAutoAssignedField,
      getAutoAssignedLabel,
      updateLastUsed,
      clearLastUsed,
    }),
    [getAutoAssignedField, getAutoAssignedLabel, updateLastUsed, clearLastUsed]
  );
};
