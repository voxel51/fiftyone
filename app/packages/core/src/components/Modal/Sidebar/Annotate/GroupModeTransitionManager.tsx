import { useGroupAnnotationModeController } from "./useGroupAnnotationModeController";

/**
 * This component wraps up `useGroupAnnotationModeController` hook
 * so that it can be conditionally used.
 */
export const GroupModeTransitionManager = () => {
  useGroupAnnotationModeController();

  return null;
};
