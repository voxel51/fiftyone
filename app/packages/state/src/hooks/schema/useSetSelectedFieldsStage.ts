import { useSetRecoilState } from "recoil";
import { fieldVisibilityStage } from "../../recoil";

/**
 *
 * @returns a callback to set the selectedFields stage
 */
export default function useSetSelectedFieldsStage() {
  return {
    setFieldVisibilityStage: useSetRecoilState(fieldVisibilityStage),
  };
}
