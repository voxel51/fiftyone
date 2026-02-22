import { DETECTION } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { countBy, maxBy } from "lodash";
import { useCallback, useMemo, useRef } from "react";
import { fieldType, isFieldReadOnly, labelSchemaData } from "../state";
import { labelsByPath } from "../useLabels";
import { defaultField, useAnnotationContext } from "./state";
import { BaseOverlay, UNDEFINED_LIGHTER_SCENE_ID, useLighter, useLighterEventHandler, type BoundingBoxLabel } from "@fiftyone/lighter";
import { AnnotationLabel, DetectionAnnotationLabel } from "@fiftyone/state";
import useCreate from "./useCreate";

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
 * Tracks the last processed `lighter:overlay-create` event ID so that only one
 * `useQuickDraw` instance handles each event, even though the hook is
 * called in multiple components.
 */
const lastProcessedCreateIdAtom = atom<string | null>(null);

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

  const createDetection = useCreate(DETECTION);

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // Using refs to prevent shared closure contexts from retaining old Scene2D instances.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  /**
   * Getter which wraps {@link fieldType} atom family.
   */
  const getFieldType = useAtomCallback(
    useCallback((get, _set, path: string) => get(fieldType(path)), [])
  );

  /**
   * Getter which wraps {@link lastUsedLabelByFieldAtom} atom family.
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
   * The actual overlay/label creation is deferred until the user mouses down in the scene.
   */
  const enableQuickDraw = useCallback(() => {
    setQuickDrawActive(true);
  }, [setQuickDrawActive]);

  /**
   * Disable quick draw mode.
   */
  const disableQuickDraw = useCallback(() => {
    setQuickDrawActive(false);
  }, [setQuickDrawActive]);

  /**
   * Toggle quick draw mode.
   */
  const toggleQuickDraw = useCallback(() => {
    if (quickDrawActive) {
      disableQuickDraw();
    } else {
      enableQuickDraw();
    }
  }, [quickDrawActive, disableQuickDraw, enableQuickDraw]);

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
      const currentScene = sceneRef.current;
      const currentLabel = selectedLabelRef.current;

      if (currentLabel && quickDrawActive) {
        // Always exit interactive mode after save
        // This ensures clean state transition
        if (
          currentScene &&
          !currentScene.isDestroyed &&
          currentScene.renderLoopActive
        ) {
          currentScene.exitInteractiveMode();
          if (currentLabel.overlay) {
            addOverlay(currentLabel.overlay as BaseOverlay);
          }
        }

        // Track last-used detection field and label for auto-assignment
        trackLastUsedDetection(currentLabel.path, currentLabel.data.label);
      }
    },
    [addOverlay, quickDrawActive, trackLastUsedDetection]
  );

  const claimCreateEvent = useAtomCallback(
    useCallback(
      (get, set, eventId: string) => {
        if (get(lastProcessedCreateIdAtom) === eventId) {
          return false;
        }

        set(lastProcessedCreateIdAtom, eventId);

        return true;
      },
      []
    )
  );

  useEventHandler(
    "lighter:overlay-create",
    useCallback(
      (payload) => {
        if (claimCreateEvent(payload.eventId)) {
          handleQuickDrawTransition();
          const field = getQuickDrawDetectionField() ?? undefined;
          const labelValue = field
            ? (getQuickDrawDetectionLabel(field) ?? undefined)
            : undefined;
          createDetection({ field, labelValue });
        }
      },
      [
        claimCreateEvent,
        createDetection,
        getQuickDrawDetectionField,
        getQuickDrawDetectionLabel,
        handleQuickDrawTransition,
      ]
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
    }),
    [
      quickDrawActive,
      lastUsedField,
      enableQuickDraw,
      disableQuickDraw,
      toggleQuickDraw,
    ]
  );
};
