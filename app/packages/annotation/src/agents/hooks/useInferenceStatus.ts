import { atom, useAtomValue, useSetAtom } from "jotai";
import type { AnnotationAgentLifecycleStatus } from "../types";

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

const inferenceStatusAtom = atom<InferenceStatus>("idle");
const inferenceProgressAtom = atom<InferenceProgress>(null);

/**
 * Read-only hook for the current inference status and any in-flight progress.
 *
 * Use this in UI that needs to react to AI inference state (e.g. status
 * banners, progress indicators for model download).
 */
export const useInferenceStatus = (): {
  status: InferenceStatus;
  progress: InferenceProgress;
} => ({
  status: useAtomValue(inferenceStatusAtom),
  progress: useAtomValue(inferenceProgressAtom),
});

/**
 * Internal setters for the inference status atoms. Intended only for the
 * canonical agent→bus bridge (`useRegisterAgentLifecycleEvents`).
 *
 * @internal
 */
export const useSetInferenceStatus = () => useSetAtom(inferenceStatusAtom);
export const useSetInferenceProgress = () => useSetAtom(inferenceProgressAtom);
