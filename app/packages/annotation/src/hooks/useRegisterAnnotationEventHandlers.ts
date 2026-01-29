import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { useCommandBus } from "@fiftyone/command-bus";
import { PersistAnnotationChanges } from "../commands";
import { useActivityToast } from "@fiftyone/state";
import { useCallback } from "react";
import { IconName, Variant } from "@voxel51/voodo";

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const commandBus = useCommandBus();
  const { setConfig } = useActivityToast();

  useAnnotationEventHandler(
    "annotation:persistenceRequested",
    useCallback(() => {
      commandBus.execute(new PersistAnnotationChanges());
    }, [commandBus])
  );

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      setConfig({
        iconName: IconName.Check,
        message: "Changes saved successfully",
        variant: Variant.Success,
      });
    }, [setConfig])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(
      ({ error }) => {
        console.error(error);

        setConfig({
          iconName: IconName.Error,
          message: `Error saving changes: ${error}`,
          variant: Variant.Danger,
        });
      },
      [setConfig]
    )
  );
};
