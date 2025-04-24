import { atom } from "jotai";

/**
 * Number of concurrently rendering labels.
 */
export const numConcurrentRenderingLabels = atom(0);

export * from "./jotai-store";
