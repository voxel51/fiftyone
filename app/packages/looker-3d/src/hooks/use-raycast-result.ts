import { useRaycastResult as useRaycastResultState } from "../state";

/**
 * Hook to access the current raycast result.
 */
export const useRaycastResult = () => {
  return useRaycastResultState();
};
