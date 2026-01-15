import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { useCommandBus } from "@fiftyone/commands";
import { PersistAnnotationChanges } from "../commands";
import { useNotification } from "@fiftyone/state";
import { useCallback } from "react";

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const commandBus = useCommandBus();
  const setNotification = useNotification();

  useAnnotationEventHandler(
    "annotation:persistenceRequested",
    useCallback(() => {
      commandBus.execute(new PersistAnnotationChanges());
    }, [commandBus])
  );

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      setNotification({
        msg: "Changes saved successfully",
        variant: "success",
      });
    }, [setNotification])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(
      ({ error }) => {
        setNotification({
          msg: `Error saving changes: ${error}`,
          variant: "error",
        });
      },
      [setNotification]
    )
  );
};
