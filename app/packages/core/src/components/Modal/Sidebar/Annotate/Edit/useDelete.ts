import { DeleteAnnotationCommand, getFieldSchema } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { current } from "./state";
import useExit from "./useExit";
import { useLabelsContext } from "../useLabels";
import {
  CommandContextManager,
  DelegatingUndoable,
  KnownCommands,
  KnownContexts,
} from "@fiftyone/commands";

export default function useDelete() {
  const commandBus = useCommandBus();
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const { addLabelToSidebar, removeLabelFromSidebar } = useLabelsContext();

  const exit = useExit();
  const setNotification = fos.useNotification();

  // Use refs to capture latest values without causing re-renders
  const labelRef = useRef(label);
  const schemaRef = useRef(schema);
  const sceneRef = useRef(scene);
  const commandBusRef = useRef(commandBus);
  const removeLabelFromSidebarRef = useRef(removeLabelFromSidebar);
  const removeOverlayRef = useRef(removeOverlay);
  const setNotificationRef = useRef(setNotification);
  const exitRef = useRef(exit);
  const addLabelToSidebarRef = useRef(addLabelToSidebar);

  // Update refs on every render
  useEffect(() => {
    labelRef.current = label;
    schemaRef.current = schema;
    sceneRef.current = scene;
    commandBusRef.current = commandBus;
    removeLabelFromSidebarRef.current = removeLabelFromSidebar;
    removeOverlayRef.current = removeOverlay;
    setNotificationRef.current = setNotification;
    exitRef.current = exit;
    addLabelToSidebarRef.current = addLabelToSidebar;
  });

  // Create stable command handler that uses refs
  const commandHandler = useCallback(() => {
    const currentLabel = labelRef.current;
    if (!currentLabel) return;

    return new DelegatingUndoable(
      "delete.undoable",
      async () => {
        if (!currentLabel) {
          return;
        }

        if (currentLabel.isNew) {
          if (
            sceneRef.current &&
            !sceneRef.current.isDestroyed &&
            sceneRef.current.renderLoopActive
          ) {
            sceneRef.current?.exitInteractiveMode();
            removeOverlayRef.current(currentLabel?.data._id, true);
          }

          exitRef.current();
          return;
        }

        try {
          const fieldSchema = getFieldSchema(
            schemaRef.current,
            currentLabel?.path
          );

          if (!fieldSchema) {
            setNotificationRef.current({
              msg: `Unable to delete label: field schema not found for path "${
                currentLabel?.path ?? "unknown"
              }".`,
              variant: "error",
            });
            return;
          }

          await commandBusRef.current.execute(
            new DeleteAnnotationCommand(currentLabel, fieldSchema)
          );

          removeLabelFromSidebarRef.current(currentLabel.data._id);
          removeOverlayRef.current(currentLabel.overlay.id, false);

          setNotificationRef.current({
            msg: `Label "${currentLabel.data.label}" successfully deleted.`,
            variant: "success",
          });

          exitRef.current();
        } catch (error) {
          console.error(error);
          setNotificationRef.current({
            msg: `Label "${
              currentLabel.data.label ?? "Label"
            }" not successfully deleted. Try again.`,
            variant: "error",
          });
        }
      },
      async () => {
        if (currentLabel) {
          try {
            const fieldSchema = getFieldSchema(
              schemaRef.current,
              currentLabel?.path
            );
            if (!fieldSchema) {
              setNotificationRef.current({
                msg: `Error restoring deleted label. "${
                  currentLabel?.path ?? "unknown"
                }".`,
                variant: "error",
              });
              return;
            }

            sceneRef.current?.addOverlay(currentLabel.overlay);
            addLabelToSidebarRef.current(currentLabel);
          } catch (error) {
            console.error(error);
            setNotificationRef.current({
              msg: `Label "${
                currentLabel.data.label ?? "Label"
              }" not restored during undo. Try again.`,
              variant: "error",
            });
          }
        }
      }
    );
  }, []);

  // We have to register the command with the raw API because the new API hasn't merged yet.
  // TODO: Remove this when the new API is merged.
  useEffect(() => {
    const ctx = CommandContextManager.instance().getCommandContext(
      KnownContexts.ModalAnnotate
    );

    // Register the command
    const cmd = ctx.registerCommand(
      KnownCommands.ModalDeleteAnnotation,
      commandHandler,
      () => !!labelRef.current,
      "Delete label",
      "Delete label"
    );

    // Bind keys
    ctx.bindKey("Delete", KnownCommands.ModalDeleteAnnotation);
    ctx.bindKey("Backspace", KnownCommands.ModalDeleteAnnotation);

    return () => {
      ctx.unbindKey("Delete");
      ctx.unbindKey("Backspace");
      ctx.unregisterCommand(cmd.id);
    };
  }, [commandHandler]); // Only re-register if commandHandler changes (which it won't)
}
