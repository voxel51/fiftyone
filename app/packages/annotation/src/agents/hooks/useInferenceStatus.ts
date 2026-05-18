import { atom, useAtomValue, useSetAtom } from "jotai";
import type { AnnotationAgentLifecycleStatus } from "../types";
import type { ProviderError } from "../../providers";

/**
 * Coarse status surfaced to UI for AI-assisted inference.
 *
 * Mirrors {@link AnnotationAgentLifecycleStatus} 1:1 today, but kept as a
 * distinct alias so consumer-facing UI states can diverge from agent-level
 * lifecycle states later without churning every call site.
 */
export type InferenceStatus = AnnotationAgentLifecycleStatus;

/**
 * Snapshot of an in-flight model weight download (or similarly progress-able
 * asset acquisition). `null` when no download is in progress.
 */
export type InferenceProgress = {
  file: string;
  loaded: number;
  total: number;
} | null;

/**
 * Last terminal error reported by the active agent. `null` once the agent
 * transitions back out of the `"error"` state.
 */
export type InferenceError = ProviderError | null;

const inferenceStatusAtom = atom<InferenceStatus>("idle");
const inferenceProgressAtom = atom<InferenceProgress>(null);
const inferenceErrorAtom = atom<InferenceError>(null);

/**
 * Read-only hook for the current inference status, any in-flight progress,
 * and the last terminal error (if `status === "error"`).
 *
 * Use this in UI that needs to react to AI inference state (e.g. status
 * banners, progress indicators, error toasts).
 */
export const useInferenceStatus = (): {
  status: InferenceStatus;
  progress: InferenceProgress;
  error: InferenceError;
} => ({
  status: useAtomValue(inferenceStatusAtom),
  progress: useAtomValue(inferenceProgressAtom),
  error: useAtomValue(inferenceErrorAtom),
});

/**
 * Internal setters for the inference status atoms. Intended only for the
 * canonical agent→bus bridge (`useRegisterAgentLifecycleEvents`).
 *
 * @internal
 */
export const useSetInferenceStatus = () => useSetAtom(inferenceStatusAtom);
export const useSetInferenceProgress = () => useSetAtom(inferenceProgressAtom);
export const useSetInferenceError = () => useSetAtom(inferenceErrorAtom);
