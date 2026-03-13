import { DETECTION } from "@fiftyone/utilities";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { countBy, maxBy } from "lodash";
import { useCallback, useMemo, useRef } from "react";
import { fieldType, isFieldReadOnly, labelSchemaData } from "../state";
import { labelsByPath } from "../useLabels";
import { defaultField, useAnnotationContext } from "./state";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import useCreate from "./useCreate";
import useExit from "./useExit";

/**
 * Flag to track if quick draw mode is active.
 * When true, detection labels are created in quick succession without exiting after each save.
 *
 * This atom is exported to allow inspection from non-React code.
 * This atom should not be used in React code.
 */
const quickDrawActiveAtom = atom<boolean>(false);
export { quickDrawActiveAtom as _dangerousQuickDrawActiveAtom };

/**
 * Tracks the last-used detection field path in quick draw mode.
 * Examples: "ground_truth.detections", "predictions.detections"
 * Used to remember which detection field the user was annotating.
 */
const lastUsedFieldAtom = atom<string | null>(null);

/**
 * Tracks the last-used label value (class) for each field path.
 * Used for auto-assignment when creating new labels in quick draw mode.
 */
const lastUsedLabelAtom = atomFamily((_field: string) =>
  atom<string | null>(null)
);

const detectionTypes = new Set(["Detection", "Detections"]);

/**
 * Tracks the last processed event ID for each event type so that only one
 * `useQuickDraw` instance handles each event, even though the hook is
 * called in multiple components.
 */
const claimedEventsAtom = atom<Map<string, string>>(new Map());

/**
 * Centralized hook for managing quick draw mode state and operations.
 */
export const useQuickDraw = () => {
  const [quickDrawActive, setQuickDrawActive] = useAtom(quickDrawActiveAtom);
  const setLastUsedField = useSetAtom(lastUsedFieldAtom);
  const labelsMap = useAtomValue(labelsByPath);
  const defaultDetectionField = useAtomValue(defaultField(DETECTION));
  const { scene } = useLighter();
  const { selectedLabel } = useAnnotationContext();
  const createDetection = useCreate(DETECTION);
  const onExit = useExit();

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
   * Getter which wraps {@link lastUsedLabelAtom} atom family.
   */
  const getLastUsedLabel = useAtomCallback(
    useCallback((get, _set, path: string) => get(lastUsedLabelAtom(path)), [])
  );

  /**
   * Setter which wraps {@link lastUsedLabelAtom} atom family.
   */
  const setLastUsedLabel = useAtomCallback(
    useCallback(
      (_get, set, path: string, label: string) =>
        set(lastUsedLabelAtom(path), label),
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
    setQuickDrawActive((prev) => !prev);
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
   *
   * Reads `lastUsedDetectionFieldAtom` directly via `useAtomCallback` so that
   * a field set by `trackLastUsedDetection` in the same synchronous call-stack
   * is visible immediately (avoids stale closure).
   */
  const getQuickDrawDetectionField = useAtomCallback(
    useCallback(
      (get): string | null => {
        const lastField = get(lastUsedFieldAtom);

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

  const claimEvent = useAtomCallback(
    useCallback((get, _set, eventType: string, eventId: string) => {
      const claimed = get(claimedEventsAtom);
      if (claimed.get(eventType) === eventId) {
        return false;
      }

      claimed.set(eventType, eventId);

      return true;
    }, [])
  );

  /**
   * Cache field/label for auto-assignment
   * Close out previous label
   */
  const finalizeCurrentDetection = useCallback(() => {
    const scene = sceneRef.current;
    const currentLabel = selectedLabelRef.current;

    if (currentLabel) {
      setLastUsedField(currentLabel.path);

      if (currentLabel.data.label) {
        setLastUsedLabel(currentLabel.path, currentLabel.data.label);
      }
    }

    scene?.exitInteractiveMode();
    onExit();
  }, [onExit, setLastUsedField, setLastUsedLabel]);

  /**
   * Cache field/label for auto-assignment
   * Close out previous label
   * Create the next detection.
   */
  useEventHandler(
    "lighter:overlay-create",
    useCallback(
      (payload) => {
        if (!claimEvent("overlay-create", payload.eventId)) {
          return;
        }

        finalizeCurrentDetection();

        const field = getQuickDrawDetectionField() ?? undefined;
        const labelValue = field
          ? getQuickDrawDetectionLabel(field) ?? undefined
          : undefined;

        createDetection({ field, labelValue });
      },
      [
        claimEvent,
        createDetection,
        finalizeCurrentDetection,
        getQuickDrawDetectionField,
        getQuickDrawDetectionLabel,
      ]
    )
  );

  /**
   * Cache field/label for auto-assignment
   * Close out previous label
   * Exit QuickDraw
   */
  useEventHandler(
    "lighter:quickdraw-quit",
    useCallback(
      (payload) => {
        if (!claimEvent("quickdraw-quit", payload.eventId)) {
          return;
        }

        finalizeCurrentDetection();
        disableQuickDraw();
      },
      [claimEvent, disableQuickDraw, finalizeCurrentDetection]
    )
  );

  return useMemo(
    () => ({
      // State (read-only)
      quickDrawActive,

      // Mode control (for UI components)
      enableQuickDraw,
      disableQuickDraw,
      toggleQuickDraw,
    }),
    [quickDrawActive, enableQuickDraw, disableQuickDraw, toggleQuickDraw]
  );
};
