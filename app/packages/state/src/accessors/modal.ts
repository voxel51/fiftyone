import { fieldSchema, modalSample, ModalSample, State } from "../recoil";
import { useRecoilValue } from "recoil";
import { Schema } from "@fiftyone/utilities";

/**
 * Get the current modal sample data.
 */
export const useModalSample = (): ModalSample => useRecoilValue(modalSample);

/**
 * Get the current modal sample schema.
 */
export const useModalSampleSchema = (): Schema =>
  useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));
