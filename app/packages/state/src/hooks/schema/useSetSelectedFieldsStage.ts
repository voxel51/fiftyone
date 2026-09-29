import { useSetReverbState } from "@fiftyone/reverb";
import { fieldVisibilityStage } from "../../atoms";

/**
 *
 * @returns a callback to set the selectedFields stage
 */
export default function useSetSelectedFieldsStage() {
  return {
    setFieldVisibilityStage: useSetReverbState(fieldVisibilityStage),
  };
}
