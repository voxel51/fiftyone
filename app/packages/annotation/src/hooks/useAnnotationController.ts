import { useCallback, useMemo } from "react";
import { useAnnotationEventBus } from "./useAnnotationEventBus";

/**
 * Controller interface for activating and deactivating annotation mode.
 */
export interface AnnotationController {
  /**
   * Enter annotation mode.
   *
   * @param path If provided, initializes and activates a field schema for the specified path
   * @param labelId If provided, activates the specified label for editing
   */
  enterAnnotationMode(path?: string, labelId?: string): void;

  /**
   * Exit annotation mode.
   */
  exitAnnotationMode(): void;
}

/**
 * Hook which provides an {@AnnotationController} instance.
 *
 * This hook is the authoritative way to enter and exit annotation mode.
 */
export const useAnnotationController = (): AnnotationController => {
  const eventBus = useAnnotationEventBus();

  const enter = useCallback(
    (path?: string, labelId?: string) =>
      eventBus.dispatch("annotation:enterAnnotationMode", { path, labelId }),
    [eventBus]
  );

  const exit = useCallback(
    () => eventBus.dispatch("annotation:exitAnnotationMode"),
    [eventBus]
  );

  return useMemo(
    () => ({ enterAnnotationMode: enter, exitAnnotationMode: exit }),
    [enter, exit]
  );
};
