import { useSetRecoilState } from "recoil";
import { selectedFieldsStageState } from "../../recoil";

/**
 *
 * @returns a callback to set the selectedFields stage
 */
export default function useSetSelectedFieldsStage() {
  return {
    setViewToFields: useSetRecoilState(selectedFieldsStageState),
  };
}
