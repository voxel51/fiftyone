import { useCallback, useMemo } from "react";
import { useAnnotationContextManager } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useAnnotationContextManager";
import { useModalModeController } from "@fiftyone/state";
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
  enterAnnotationMode(path?: string, labelId?: string): Promise<void>;

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
  const contextManager = useAnnotationContextManager();
  const modeController = useModalModeController();
  const eventBus = useAnnotationEventBus();

  const enter = useCallback(
    async (path?: string, labelId?: string) => {
      modeController.activateAnnotateMode();
      await contextManager.enter(path, labelId);
      eventBus.dispatch("annotation:enterAnnotationMode", { path, labelId });
    },
    [contextManager, eventBus, modeController]
  );

  const exit = useCallback(() => {
    contextManager.exit();
    modeController.activateExploreMode();
    eventBus.dispatch("annotation:exitAnnotationMode");
  }, [contextManager, eventBus, modeController]);

  return useMemo(
    () => ({ enterAnnotationMode: enter, exitAnnotationMode: exit }),
    [enter, exit]
  );
};
