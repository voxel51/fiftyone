import { useReset3dAnnotationMode } from "@fiftyone/looker-3d/src/state/accessors";
import { isPatchesView } from "@fiftyone/state";
import { CLASSIFICATION } from "@fiftyone/utilities";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { useCurrentType, useFieldsOfType } from "../redux/hooks";
import useCreate from "./useCreate";
import useExit from "./useExit";

/**
 * Hook for managing classification creation state and actions.
 *
 * Encapsulates the disabled logic, field availability, and creation action
 * for the "Create new classification" button.
 */
export const useClassification = () => {
  const create = useCreate(CLASSIFICATION);
  const onExit = useExit();
  const isPatchView = useRecoilValue(isPatchesView);
  const reset3dAnnotationMode = useReset3dAnnotationMode();
  const fields = useFieldsOfType(CLASSIFICATION);
  const classificationActive = useCurrentType() === CLASSIFICATION;

  const disabled = isPatchView || fields.length === 0;

  const tooltip = isPatchView
    ? "Creating classifications is not supported in this view"
    : "Create new classification";

  const enableClassification = useCallback(() => {
    if (disabled) return;

    create();
    reset3dAnnotationMode();
  }, [create, disabled, reset3dAnnotationMode]);

  const disableClassification = useCallback(() => {
    onExit();
  }, [onExit]);

  const toggleClassification = useCallback(() => {
    if (classificationActive) {
      disableClassification();
    } else {
      enableClassification();
    }
  }, [classificationActive, disableClassification, enableClassification]);

  return useMemo(
    () => ({
      classificationActive,
      disabled,
      tooltip,
      enableClassification,
      disableClassification,
      toggleClassification,
    }),
    [
      classificationActive,
      disabled,
      tooltip,
      enableClassification,
      disableClassification,
      toggleClassification,
    ]
  );
};
