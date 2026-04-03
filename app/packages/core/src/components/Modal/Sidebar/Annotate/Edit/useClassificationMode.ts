import { useReset3dAnnotationMode } from "@fiftyone/looker-3d/src/state/accessors";
import { isPatchesView } from "@fiftyone/state";
import { CLASSIFICATION } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { currentType, fieldsOfType } from "./state";
import useCreate from "./useCreate";
import useExit from "./useExit";

/**
 * Hook for managing classification creation state and actions.
 *
 * Encapsulates the disabled logic, field availability, and creation action
 * for the "Create new classification" button.
 */
export const useClassificationMode = () => {
  const create = useCreate(CLASSIFICATION);
  const onExit = useExit();
  const isPatchView = useRecoilValue(isPatchesView);
  const reset3dAnnotationMode = useReset3dAnnotationMode();
  const fields = useAtomValue(fieldsOfType(CLASSIFICATION));
  const classificationModeActive = useAtomValue(currentType) === CLASSIFICATION;

  const disabled = isPatchView || fields.length === 0;

  const tooltip = isPatchView
    ? "Creating classifications is not supported in this view"
    : "Create new classification";

  const activateClassificationMode = useCallback(() => {
    if (disabled) return;

    create();
    reset3dAnnotationMode();
  }, [create, disabled, reset3dAnnotationMode]);

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
    ]
  );
};
