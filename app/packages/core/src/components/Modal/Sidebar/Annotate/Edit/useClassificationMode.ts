import { useReset3dAnnotationMode } from "@fiftyone/looker-3d/src/state/accessors";
import { isPatchesView, isVideoDataset } from "@fiftyone/state";
import { CLASSIFICATION } from "@fiftyone/utilities";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import {
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";
import useExit from "./useExit";

/**
 * Hook for managing classification creation state and actions.
 *
 * Encapsulates the disabled logic, field availability, and creation action
 * for the "Create new classification" button.
 */
export const useClassificationMode = () => {
  const annotationContext = useAnnotationContext();
  const onExit = useExit();
  const isPatchView = useRecoilValue(isPatchesView);
  const reset3dAnnotationMode = useReset3dAnnotationMode();
  const isVideo = useRecoilValue(isVideoDataset);
  const { fields: allFields } = useAnnotationFields(CLASSIFICATION);
  // On video datasets, only sample-level Classification fields are supported;
  // frame-level (`frames.*`) Classification is gated separately in the schema
  // manager and must not appear in the toolbar's field picker.
  const fields = useMemo(
    () =>
      isVideo ? allFields.filter((p) => !p.startsWith("frames.")) : allFields,
    [allFields, isVideo],
  );
  const classificationModeActive =
    annotationContext.selected?.type === CLASSIFICATION;

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Creating classifications is not supported in this view"
    : noActiveFields
      ? "No active fields"
      : classificationModeActive
        ? "Exit classification creation"
        : "Create new classification";

  const activateClassificationMode = useCallback(() => {
    if (disabled) return;

    annotationContext.createNew(CLASSIFICATION);
    reset3dAnnotationMode();
  }, [annotationContext, disabled, reset3dAnnotationMode]);

  const deactivateClassificationMode = useCallback(() => {
    onExit();
  }, [onExit]);

  const toggleClassificationMode = useCallback(() => {
    if (classificationModeActive) {
      deactivateClassificationMode();
    } else {
      activateClassificationMode();
    }
  }, [
    classificationModeActive,
    deactivateClassificationMode,
    activateClassificationMode,
  ]);

  return useMemo(
    () => ({
      classificationModeActive,
      disabled,
      tooltip,
      activateClassificationMode,
      deactivateClassificationMode,
      toggleClassificationMode,
    }),
    [
      classificationModeActive,
      disabled,
      tooltip,
      activateClassificationMode,
      deactivateClassificationMode,
      toggleClassificationMode,
    ],
  );
};
