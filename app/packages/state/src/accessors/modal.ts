import { fieldSchema, modalSample, ModalSample, State } from "../recoil";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { Schema } from "@fiftyone/utilities";
import { modalMode } from "../jotai";
import { preferredGroupAnnotationSliceAtom } from "../jotai/group-annotation";
import { useAtom, useAtomValue } from "jotai";

/**
 * Get the current modal sample data.
 *
 * If the modal is not open, or the sample is being loaded, this hook will
 * return `undefined`.
 */
export const useModalSample = (): ModalSample | undefined => {
  const loadable = useRecoilValueLoadable(modalSample);

  if (loadable.state === "hasValue") {
    return loadable.contents;
  }

  return undefined;
};

/**
 * Get the current modal sample schema.
 */
export const useModalSampleSchema = (): Schema =>
  useRecoilValue(fieldSchema({ space: State.SPACE.SAMPLE }));

/**
 * Get the current modal mode.
 */
export const useModalMode = () => useAtomValue(modalMode);

/**
 * Get and set the preferred annotation slice for grouped datasets.
 * Returns [preferredSlice, setPreferredSlice].
 */
export const usePreferredGroupAnnotationSlice = () =>
  useAtom(preferredGroupAnnotationSliceAtom);
