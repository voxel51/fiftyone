import { useCallback, useEffect, useMemo, useRef } from "react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRecoilValue } from "recoil";

import { useLighter } from "@fiftyone/lighter";
import { DETECTION } from "@fiftyone/utilities";

import useExit from "./useExit";

import { isPatchesView } from "@fiftyone/state";
import { current } from "./useAnnotationContext/selectors";
import {
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";

/**
 * Flag to track if detection mode is active.
 * When true, detection labels are created in quick succession without exiting after each save.
 *
 * This atom is exported to allow inspection from non-React code.
 * This atom should not be used in React code.
 */
const detectionModeActiveAtom = atom<boolean>(false);
export { detectionModeActiveAtom as _unsafeDetectionModeActiveAtom };

// Set of label ids currently being authored as masks. Updated by
// `useBridge` via the public `setEditingMask` action.
const editingMaskLabelIdsAtom = atom<ReadonlySet<string>>(new Set<string>());

// Derived: does the currently-edited label have a mask?
const isEditingMaskAtom = atom((get) => {
  const ids = get(editingMaskLabelIdsAtom);
  if (ids.size === 0) return false;

  const data = get(current)?.data as { _id?: string } | undefined;
  return data?._id !== undefined && ids.has(data._id);
});

/**
 * Centralized hook for managing detection mode state and operations.
 */
export const useDetectionMode = () => {
  const [detectionModeActive, setDetectionModeActive] = useAtom(
    detectionModeActiveAtom
  );
  const isPatchView = useRecoilValue(isPatchesView);
  const { scene } = useLighter();
  const annotationContext = useAnnotationContext();
  const { selected } = annotationContext;
  const editingLabelType = selected.type;
  const onExit = useExit();
  const { fields } = useAnnotationFields(DETECTION);

  // Using refs to prevent shared closure contexts from retaining old Scene2D instances.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const isEditingMask = useAtomValue(isEditingMaskAtom);
  const setEditingMaskIds = useSetAtom(editingMaskLabelIdsAtom);

  // Mark `id` as mid-mask authoring (when `hasMask`) or clear that
  const setEditingMask = useCallback(
    (id: string, hasMask: boolean) => {
      setEditingMaskIds((prev) => {
        const has = prev.has(id);
        if (hasMask === has) return prev;

        const next = new Set(prev);
        if (hasMask) next.add(id);
        else next.delete(id);

        return next;
      });
    },
    [setEditingMaskIds]
  );

  // `mask` and `mask_path` are Detection-only fields; cast at the access
  // site since the union narrows them out.
  const labelData = selected.label?.data as
    | { mask?: unknown; mask_path?: unknown }
    | undefined;
  const isEditingDetection =
    editingLabelType === DETECTION &&
    !labelData?.mask &&
    !labelData?.mask_path &&
    !isEditingMask;

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
   * Exit interactive mode, snapshot last-used (via clear), and run the
   * renderer-side teardown via useExit.
   *
   * Clear must run before onExit so the lastUsed snapshot reads the
   * still-current label; onExit's closure captures pre-clear values, so
   * its scene cleanup is unaffected by the ordering.
   */
  const finalizeCurrentDetection = useCallback(() => {
    sceneRef.current?.exitInteractiveMode();
    annotationContext.clear();
    onExit();
  }, [annotationContext, onExit]);

  const activateDetectionMode = useCallback(() => {
    setDetectionModeActive(true);
  }, [setDetectionModeActive]);

  const deactivateDetectionMode = useCallback(() => {
    finalizeCurrentDetection();
    setDetectionModeActive(false);
  }, [finalizeCurrentDetection, setDetectionModeActive]);

  // Auto-activate detection mode when a pre-existing bbox detection is selected,
  // auto-deactivate when a pre-existing label of a different type is selected.
  useEffect(() => {
    if (isEditingDetection && !detectionModeActive) {
      setDetectionModeActive(true);
    } else if (editingLabelType && !isEditingDetection && detectionModeActive) {
      setDetectionModeActive(false);
    }
  }, [
    detectionModeActive,
    editingLabelType,
    isEditingDetection,
    setDetectionModeActive,
  ]);

  const toggleDetectionMode = useCallback(() => {
    if (detectionModeActive) {
      deactivateDetectionMode();
    } else {
      activateDetectionMode();
    }
  }, [detectionModeActive, deactivateDetectionMode, activateDetectionMode]);

  /**
   * Finalize the previous detection and create the next one. Field and
   * label class are auto-resolved from {@link useAnnotationContext}'s
   * last-used memory.
   */
  const create = useCallback(() => {
    sceneRef.current?.exitInteractiveMode();
    annotationContext.createNew(DETECTION);
  }, [annotationContext]);

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

      // Bridge actions (wired to Lighter events by `useBridge`)
      create,
      setEditingMask,
    }),
    [
      activateDetectionMode,
      deactivateDetectionMode,
      detectionModeActive,
      disabled,
      toggleDetectionMode,
      tooltip,
      create,
      setEditingMask,
    ]
  );
};
