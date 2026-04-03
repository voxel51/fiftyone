import { DETECTION } from "@fiftyone/utilities";
import { countBy, maxBy } from "lodash";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  selectDefaultField,
  setLastUsedLabel as setLastUsedLabelAction,
} from "../redux/annotationSlice";
import {
  useAnnotationSelector,
  useCurrentType,
  useEditingLabel,
  useLabelsByPath,
  useLastUsedField,
  useQuickDrawActiveState,
  useSetLastUsedField,
} from "../redux/hooks";
import { annotationStore } from "../redux/store";
import {
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import useCreate from "./useCreate";
import useExit from "./useExit";

const detectionTypes = new Set(["Detection", "Detections"]);

const isFieldReadOnly = (data: any): boolean =>
  !!(data?.label_schema?.read_only || data?.read_only);

// Module-level event dedup map (not state — just coordination)
const claimedEvents = new Map<string, string>();

/**
 * Centralized hook for managing quick draw mode state and operations.
 */
export const useQuickDraw = () => {
  const [quickDrawActive, setQuickDrawActive] = useQuickDrawActiveState();
  const editingLabelType = useCurrentType();
  const isEditingDetection = editingLabelType === DETECTION;
  const setLastUsedField = useSetLastUsedField();
  const labelsMap = useLabelsByPath();
  const defaultDetectionField = useAnnotationSelector(selectDefaultField(DETECTION));
  const { scene } = useLighter();
  const selectedLabel = useEditingLabel();
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

  const getFieldType = useCallback((path: string) => {
    const schemas = annotationStore.getState().annotation.labelSchemasData;
    const data = schemas?.[path];
    return data?.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : undefined;
  }, []);

  const getLastUsedLabel = useCallback((path: string) => {
    return annotationStore.getState().annotation.lastUsedLabels[path] ?? null;
  }, []);

  const setLastUsedLabel = useCallback((path: string, label: string) => {
    annotationStore.dispatch(setLastUsedLabelAction({ field: path, label }));
  }, []);

  const getLabelSchema = useCallback((path: string) => {
    const schemas = annotationStore.getState().annotation.labelSchemasData;
    return schemas?.[path];
  }, []);

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

  // Auto-enable QuickDraw when a detection is being edited,
  // auto-disable when a different label type is selected.
  useEffect(() => {
    if (isEditingDetection && !quickDrawActive) {
      setQuickDrawActive(true);
    } else if (editingLabelType && !isEditingDetection && quickDrawActive) {
      setQuickDrawActive(false);
    }
  }, [editingLabelType, isEditingDetection, quickDrawActive, setQuickDrawActive]);

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
  const getQuickDrawDetectionField = useCallback(
      (): string | null => {
        const state = annotationStore.getState().annotation;
        const lastField = state.lastUsedField;
        const schemas = state.labelSchemasData;

        if (lastField && schemas) {
          const schema = schemas[lastField];
          if (schema && !schema.read_only && !schema.label_schema?.read_only) {
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
      const relevantLabels = fieldLabels.filter((label) => label.label);

      if (relevantLabels.length > 0) {
        const labelCounts = countBy(
          relevantLabels,
          (label) => label.label
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

  const claimEvent = useCallback((eventType: string, eventId: string) => {
    if (claimedEvents.get(eventType) === eventId) {
      return false;
    }
    claimedEvents.set(eventType, eventId);
    return true;
  }, []);

  /**
   * Cache field/label for auto-assignment
   * Close out previous label
   */
  const finalizeCurrentDetection = useCallback(() => {
    const scene = sceneRef.current;
    const currentLabel = selectedLabelRef.current;

    if (currentLabel) {
      setLastUsedField(currentLabel.path);

      if (currentLabel.label) {
        setLastUsedLabel(currentLabel.path, currentLabel.label);
      }
    }

    scene?.exitInteractiveMode();
    onExit();
  }, [onExit, setLastUsedField, setLastUsedLabel]);

  /**
   * Toggle quick draw mode. When exiting, finalizes the current detection
   * (caches field/label, exits interactive mode, closes edit form).
   */
  const toggleQuickDraw = useCallback(() => {
    if (quickDrawActive) {
      finalizeCurrentDetection();
      disableQuickDraw();
    } else {
      enableQuickDraw();
    }
  }, [
    quickDrawActive,
    finalizeCurrentDetection,
    disableQuickDraw,
    enableQuickDraw,
  ]);

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
