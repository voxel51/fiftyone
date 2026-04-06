import { useCallback, useEffect, useMemo, useRef } from "react";
import { countBy, maxBy } from "lodash";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import type { PrimitiveAtom } from "jotai";
import { useRecoilValue } from "recoil";

import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { DETECTION } from "@fiftyone/utilities";

import { labelsByPath } from "../useLabels";
import useCreate from "./useCreate";
import useExit from "./useExit";

import { isPatchesView } from "@fiftyone/state";
import { fieldType, isFieldReadOnly, labelSchemaData } from "../state";
import {
  currentType,
  defaultField,
  fieldsOfType,
  useAnnotationContext,
} from "./state";

/**
 * Flag to track if detection mode is active.
 * When true, detection labels are created in quick succession without exiting after each save.
 *
 * This atom is exported to allow inspection from non-React code.
 * This atom should not be used in React code.
 */
const detectionModeActiveAtom = atom<boolean>(false);
export { detectionModeActiveAtom as _unsafeDetectionModeActiveAtom };

/**
 * Tracks the last-used detection field path in detection mode.
 * Examples: "ground_truth.detections", "predictions.detections"
 * Used to remember which detection field the user was annotating.
 */
const lastUsedFieldAtom = atom<string | null>(null) as PrimitiveAtom<
  string | null
>;

/**
 * Tracks the last-used label value (class) for each field path.
 * Used for auto-assignment when creating new labels in detection mode.
 */
const lastUsedLabelAtom = atomFamily(
  (_field: string) => atom<string | null>(null) as PrimitiveAtom<string | null>
);

const detectionTypes = new Set(["Detection", "Detections"]);

/**
 * Tracks the last processed event ID for each event type so that only one
 * `useDetectionMode` instance handles each event, even though the hook is
 * called in multiple components.
 */
const claimedEventsAtom = atom<Map<string, string>>(new Map());

/**
 * Centralized hook for managing detection mode state and operations.
 */
export const useDetectionMode = () => {
  const [detectionModeActive, setDetectionModeActive] = useAtom(
    detectionModeActiveAtom
  );
  const editingLabelType = useAtomValue(currentType);
  const isEditingDetection = editingLabelType === DETECTION;
  const isPatchView = useRecoilValue(isPatchesView);
  const setLastUsedField = useSetAtom(lastUsedFieldAtom);
  const labelsMap = useAtomValue(labelsByPath);
  const defaultDetectionField = useAtomValue(defaultField(DETECTION));
  const { scene } = useLighter();
  const { selectedLabel } = useAnnotationContext();
  const createDetection = useCreate(DETECTION);
  const onExit = useExit();
  const fields = useAtomValue(fieldsOfType(DETECTION));

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  // Using refs to prevent shared closure contexts from retaining old Scene2D instances.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const selectedLabelRef = useRef(selectedLabel);
  selectedLabelRef.current = selectedLabel;

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Creating detections is not supported in this view"
    : noActiveFields
    ? "No active fields"
    : detectionModeActive
    ? "Exit detection creation"
    : "Create new detections";

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
   * Cache field/label for auto-assignment, exit interactive mode,
   * and close out the current label.
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
   * Enable detection mode for Detection annotations.
   * The actual overlay/label creation is deferred until the user mouses down in the scene.
   */
  const activateDetectionMode = useCallback(() => {
    setDetectionModeActive(true);
  }, [setDetectionModeActive]);

  /**
   * Disable detection mode and gracefully close out any label being edited.
   */
  const deactivateDetectionMode = useCallback(() => {
    finalizeCurrentDetection();
    setDetectionModeActive(false);
  }, [finalizeCurrentDetection, setDetectionModeActive]);

  // Auto-enable detection mode when a detection is being edited,
  // auto-disable when a different label type is selected.
  useEffect(() => {
    if (isEditingDetection && !detectionModeActive) {
      setDetectionModeActive(true);
    } else if (editingLabelType && !isEditingDetection && detectionModeActive) {
      setDetectionModeActive(false);
    }
  }, [
    editingLabelType,
    isEditingDetection,
    detectionModeActive,
    setDetectionModeActive,
  ]);

  /**
   * Get the auto-assigned detection field path.
   *
   * Auto-assignment priority:
   * 1. Last-used detection field (if in detection mode and previously set)
   * 2. Field with the most detection labels
   * 3. Default detection field
   *
   * Returns null if no detection field is available.
   *
   * Reads `lastUsedDetectionFieldAtom` directly via `useAtomCallback` so that
   * a field set by `trackLastUsedDetection` in the same synchronous call-stack
   * is visible immediately (avoids stale closure).
   */
  const getDetectionModeField = useAtomCallback(
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
   * Detection mode only works with Detection labels.
   *
   * Auto-assignment priority:
   * 1. Last-used label for this field (if in detection mode)
   * 2. Most common label for this specific field
   * 3. First class in the schema for the field
   *
   * Returns null if no label value can be determined.
   */
  const getDetectionModeLabel = useCallback(
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
    useCallback((get, set, eventType: string, eventId: string) => {
      const claimedEvents = get(claimedEventsAtom);
      if (claimedEvents.get(eventType) === eventId) {
        return false;
      }

      const updatedEvents = new Map(claimedEvents);
      updatedEvents.set(eventType, eventId);
      set(claimedEventsAtom, updatedEvents);

      return true;
    }, [])
  );

  /**
   * Toggle detection mode. When exiting, deactivateDetectionMode handles
   * finalization (caches field/label, exits interactive mode, closes edit form).
   */
  const toggleDetectionMode = useCallback(() => {
    if (detectionModeActive) {
      deactivateDetectionMode();
    } else {
      activateDetectionMode();
    }
  }, [detectionModeActive, deactivateDetectionMode, activateDetectionMode]);

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

        const field = getDetectionModeField() ?? undefined;
        const labelValue = field
          ? getDetectionModeLabel(field) ?? undefined
          : undefined;

        createDetection({ field, labelValue });
      },
      [
        claimEvent,
        createDetection,
        finalizeCurrentDetection,
        getDetectionModeField,
        getDetectionModeLabel,
      ]
    )
  );

  /**
   * Exit detection mode (triggered when user clicks without dragging).
   */
  useEventHandler(
    "lighter:detection-mode-quit",
    useCallback(
      (payload) => {
        if (!claimEvent("detection-mode-quit", payload.eventId)) {
          return;
        }

        deactivateDetectionMode();
      },
      [claimEvent, deactivateDetectionMode]
    )
  );

  return useMemo(
    () => ({
      // State (read-only)
      detectionModeActive,
      disabled,
      tooltip,

      // Mode control (for UI components)
      activateDetectionMode,
      deactivateDetectionMode,
      toggleDetectionMode,
    }),
    [
      activateDetectionMode,
      deactivateDetectionMode,
      detectionModeActive,
      disabled,
      toggleDetectionMode,
      tooltip,
    ]
  );
};
