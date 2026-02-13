import { useRecoilValue } from "recoil";
import { raycastResultAtom } from "../state";

/**
 * Hook to access the current raycast result.
 */
export const useRaycastResult = () => {
  return useRecoilValue(raycastResultAtom);
};
