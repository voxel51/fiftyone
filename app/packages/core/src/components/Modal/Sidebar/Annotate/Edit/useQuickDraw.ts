import { DETECTION } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { countBy, maxBy } from "lodash";
import { useCallback, useMemo } from "react";
import { fieldType, isFieldReadOnly, labelSchemaData } from "../state";
import { labelsByPath } from "../useLabels";
import { defaultField, useAnnotationContext } from "./state";
import { BaseOverlay, UNDEFINED_LIGHTER_SCENE_ID, useLighter, useLighterEventHandler, type BoundingBoxLabel } from "@fiftyone/lighter";
import { AnnotationLabel, DetectionAnnotationLabel } from "@fiftyone/state";

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
const lastUsedLabelByFieldAtom = atomFamily((_field: string) =>
  atom<string | null>(null)
);

const detectionTypes = new Set(["Detection", "Detections"]);

/**
 * Stores the QuickDraw create callback in an atom so it survives
 * unmount/remount cycles during QuickDraw transitions.
 */
const quickDrawCreateDetectionAtom = atom<
  ((options?: { field?: string; labelValue?: string }) => void) | null
>(null);

/**
 * Tracks processed `lighter:overlay-create` event IDs so that only one
 * `useQuickDraw` instance handles each event, even though the hook is
 * called in multiple components.
 */
let _lastProcessedCreateId: string | null = null;

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
  const { scene, addOverlay } = useLighter();
  const { selectedLabel } = useAnnotationContext();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const getCreateDetection = useAtomCallback(
    useCallback((get) => get(quickDrawCreateDetectionAtom), [])
  );

  const setCreateDetection = useAtomCallback(
    useCallback(
      (_get, set, cb: ((shouldUseQuickDraw: boolean) => void) | null) =>
        set(quickDrawCreateDetectionAtom, () => cb),
      []
    )
  );

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
   * Sets quickDraw active, and registers the deferred creation callback.
   * The actual overlay/label creation is deferred until the user mouses down in the scene.
   *
   * @param createDetection - Function that creates a detection label (from useCreate).
   *   Will be called with auto-assigned `field` and `labelValue` on pointer-down.
   */
  const enableQuickDraw = useCallback(
    (createDetection: (options?: { field?: string; labelValue?: string | null }) => void) => {
      setQuickDrawActive(true);
      setCreateDetection(createDetection);
    },
    [setQuickDrawActive, setCreateDetection]
  );

  /**
   * Disable quick draw mode.
   * Resets the active flag to false. Last-used field and label atoms
   */
  const disableQuickDraw = useCallback(() => {
    setQuickDrawActive(false);
    setCreateDetection(null);
  }, [setQuickDrawActive, setCreateDetection]);

  /**
   * Toggle quick draw mode. Enables with the given create function if
   * currently inactive, disables if currently active.
   */
  const toggleQuickDraw = useCallback(
    (createDetection: (options?: { field?: string; labelValue?: string | null }) => void) => {
      if (quickDrawActive) {
        disableQuickDraw();
      } else {
        enableQuickDraw(createDetection);
      }
    },
    [quickDrawActive, disableQuickDraw, enableQuickDraw]
  );

  /**
   * Get the auto-assigned detection field path.
   *
   * Auto-assignment priority:
   * 1. Last-used detection field (if in quick draw mode and previously set)
   * 2. Field with the most detection labels
   * 3. Default detection field
   *
   * Returns null if no detection field is available.
   *
   * Reads `lastUsedDetectionFieldAtom` directly via `useAtomCallback` so that
   * a field set by `trackLastUsedDetection` in the same synchronous call-stack
   * is visible immediately (avoids stale closure).
   */
  const getQuickDrawDetectionField = useAtomCallback(
    useCallback(
      (get): string | null => {
        const lastField = get(lastUsedDetectionFieldAtom);

        if (lastField) {
          const schema = get(labelSchemaData(lastField));
          if (!isFieldReadOnly(schema)) {
            return lastField;
          }
        }

        let maxCount = 0;
        let fieldWithMostLabels: string | null = null;

        for (const [fieldPath, fieldLabels] of Object.entries(labelsMap)) {
          const typeStr = getFieldType(fieldPath);
          const schema = getLabelSchema(fieldPath);

          if (
            detectionTypes.has(typeStr || "") &&
            !isFieldReadOnly(schema) &&
            fieldLabels.length > maxCount
          ) {
            maxCount = fieldLabels.length;
            fieldWithMostLabels = fieldPath;
          }
        }

        if (fieldWithMostLabels) {
          return fieldWithMostLabels;
        }

        // Fallback to default detection field
        return defaultDetectionField;
      },
      [defaultDetectionField, getFieldType, getLabelSchema, labelsMap]
    )
  );

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
    (
      newFieldPath: string,
      currentLabel: DetectionAnnotationLabel,
      setCurrent: (label: AnnotationLabel) => void
    ): void => {
      if (!quickDrawActive || !currentLabel) {
        return;
      }

      const newLabelValue = getQuickDrawDetectionLabel(newFieldPath);

      const newData = {
        ...currentLabel.data,
        ...(newLabelValue ? { label: newLabelValue } : {}),
      };

      currentLabel.overlay.updateField(newFieldPath);
      currentLabel.overlay.updateLabel(newData as BoundingBoxLabel);

      setCurrent({ ...currentLabel, path: newFieldPath, data: newData });
    },
    [quickDrawActive, getQuickDrawDetectionLabel]
  );

  /**
   * Handle the transition from creating one detection to another.
   *
   * This effectively finalizes the current bounding box and creates a new
   * drawing session.
   */
  const handleQuickDrawTransition = useCallback(
    /**
     * Closes the current drawing session and enters a "ready to draw" state.
     * The next detection is deferred until the user mouses down in the scene.
     *
     * The create callback registered by {@link enableQuickDraw} is preserved —
     * the `lighter:overlay-create` event will invoke it on the next pointer-down.
     */
    () => {
      if (selectedLabel && quickDrawActive) {
        // Always exit interactive mode after save
        // This ensures clean state transition
        if (scene && !scene.isDestroyed && scene.renderLoopActive) {
          scene.exitInteractiveMode();
          addOverlay(selectedLabel.overlay as BaseOverlay);
        }

        // Track last-used detection field and label for auto-assignment
        trackLastUsedDetection(selectedLabel.path, selectedLabel.data.label);
      }
    },
    [addOverlay, quickDrawActive, scene, selectedLabel, trackLastUsedDetection]
  );

  useEventHandler(
    "lighter:overlay-create",
    useCallback(
			(payload) => {
				if (payload.eventId !== _lastProcessedCreateId) {
					_lastProcessedCreateId = payload.eventId;
					const field = getQuickDrawDetectionField() ?? undefined;
					const labelValue = field ? getQuickDrawDetectionLabel(field) ?? undefined : undefined;
					getCreateDetection()?.({ field, labelValue });
				}
      },
      [getCreateDetection, getQuickDrawDetectionField, getQuickDrawDetectionLabel]
    )
  );

  return useMemo(
    () => ({
      // State (read-only)
      quickDrawActive,
      lastUsedDetectionField: lastUsedField,

      // Mode control (for UI components)
      enableQuickDraw,
      disableQuickDraw,
      toggleQuickDraw,

      // Auto-assignment (for useCreate)
      getQuickDrawDetectionField,
      getQuickDrawDetectionLabel,

      // Tracking and transitions
      trackLastUsedDetection,
      handleQuickDrawTransition,

      // Field switching (for Field component)
      handleQuickDrawFieldChange,
    }),
    [
      quickDrawActive,
      lastUsedField,
      enableQuickDraw,
      disableQuickDraw,
      toggleQuickDraw,
      getQuickDrawDetectionField,
      getQuickDrawDetectionLabel,
      handleQuickDrawTransition,
      trackLastUsedDetection,
      handleQuickDrawFieldChange,
    ]
  );
};
