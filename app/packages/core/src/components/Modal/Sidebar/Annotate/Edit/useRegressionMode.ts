import { useReset3dAnnotationMode } from "@fiftyone/looker-3d/src/state/accessors";
import { isPatchesView, isVideoDataset } from "@fiftyone/state";
import { REGRESSION } from "@fiftyone/utilities";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import {
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";
import useExit from "./useExit";

/**
 * Hook for managing regression creation state and actions.
 *
 * Encapsulates the disabled logic, field availability, and creation action
 * for the "Create new regression" button.
 */
export const useRegressionMode = () => {
  const annotationContext = useAnnotationContext();
  const onExit = useExit();
  const isPatchView = useRecoilValue(isPatchesView);
  const reset3dAnnotationMode = useReset3dAnnotationMode();
  const isVideo = useRecoilValue(isVideoDataset);
  const { fields: allFields } = useAnnotationFields(REGRESSION);
  // On video datasets, only sample-level Regression fields are supported;
  // frame-level (`frames.*`) Regression is not, so it must not appear in the
  // toolbar's field picker.
  const fields = useMemo(
    () =>
      isVideo ? allFields.filter((p) => !p.startsWith("frames.")) : allFields,
    [allFields, isVideo],
  );
  const regressionModeActive = annotationContext.selected?.type === REGRESSION;

  const noActiveFields = fields.length === 0;
  const disabled = isPatchView || noActiveFields;

  const tooltip = isPatchView
    ? "Creating regressions is not supported in this view"
    : noActiveFields
      ? "No active fields"
      : regressionModeActive
        ? "Exit regression creation"
        : "Create new regression";

  const activateRegressionMode = useCallback(() => {
    if (disabled) return;

    annotationContext.createNew(REGRESSION);
    reset3dAnnotationMode();
  }, [annotationContext, disabled, reset3dAnnotationMode]);

  // gated so `useDeactivateAllModes` does not exit twice (Classification's
  // deactivate already exits unconditionally)
  const deactivateRegressionMode = useCallback(() => {
    if (regressionModeActive) onExit();
  }, [onExit, regressionModeActive]);

  const toggleRegressionMode = useCallback(() => {
    if (regressionModeActive) {
      deactivateRegressionMode();
    } else {
      activateRegressionMode();
    }
  }, [regressionModeActive, deactivateRegressionMode, activateRegressionMode]);

  return useMemo(
    () => ({
      regressionModeActive,
      disabled,
      tooltip,
      activateRegressionMode,
      deactivateRegressionMode,
      toggleRegressionMode,
    }),
    [
      regressionModeActive,
      disabled,
      tooltip,
      activateRegressionMode,
      deactivateRegressionMode,
      toggleRegressionMode,
    ],
  );
};
