import { createUseEventHandler } from "@fiftyone/events";
import { LighterEventGroup } from "../events";

/**
 * Factory function that creates a type-safe event handler hook for Lighter events.
 * The returned hook automatically registers/unregisters handlers on mount/unmount.
 *
 * @param sceneId - Scene ID to use as the channel ID.
 * @returns A hook function that registers event handlers with automatic cleanup
 *
 * @example
 * ```typescript
 * const useEventHandler = useLighterEventHandler(sceneId);
 * useEventHandler("lighter:overlay-select", useCallback((payload) => {
 *   console.log(payload.id);
 * }, []));
 * ```
 */
export const useLighterEventHandler = (sceneId: string) =>
  createUseEventHandler<LighterEventGroup>(sceneId);
