import { atom, useAtomValue, useSetAtom } from "jotai";

export type InferenceStatus = "idle" | "inferring";

const inferenceStatusAtom = atom<InferenceStatus>("idle");

/**
 * Read-only hook for the current inference status. Use this in UI that
 * needs to react to in-flight AI inference (e.g. status banners).
 */
export const useInferenceStatus = (): InferenceStatus =>
  useAtomValue(inferenceStatusAtom);

/**
 * Setter for inference status. Intended for use inside the inference
 * dispatcher (`useRegisterAnnotationToolEventHandlers`).
 */
export const useSetInferenceStatus = () => useSetAtom(inferenceStatusAtom);
