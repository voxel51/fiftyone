import { DeleteAnnotationCommand, getFieldSchema } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import {
  DelegatingUndoable,
  KnownCommands,
  KnownContexts,
  useCreateCommand,
  useKeyBindings,
  useUndoRedo,
} from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { useRecoilValue } from "recoil";
import { useLabelsContext } from "./useLabels";
import { current } from "./Edit/state";
import useExit from "./Edit/useExit";

export default function useBindAnnotationCommands() {
  const commandBus = useCommandBus();
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const { addLabelToSidebar, removeLabelFromSidebar } = useLabelsContext();

  const exit = useExit();
  const setNotification = fos.useNotification();

  // maintain a ref to the current label and notification setter
  // so that we don't need to recreate the undoable when they change
  const labelRef = useRef(label);
  labelRef.current = label;

  const setNotificationRef = useRef(setNotification);
  setNotificationRef.current = setNotification;

  const { undo, redo, undoEnabled, redoEnabled } = useUndoRedo(
    KnownContexts.ModalAnnotate
  );
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const undoEnabledRef = useRef(undoEnabled);
  undoEnabledRef.current = undoEnabled;
  const redoEnabledRef = useRef(redoEnabled);
  redoEnabledRef.current = redoEnabled;

  const undoCommand = useCreateCommand(
    KnownContexts.ModalAnnotate,
    KnownCommands.Undo,
    undoRef.current,
    () => {
      return undoEnabledRef.current;
    },
    "Undo",
    "Undoes the previous command."
  );
  const redoCommand = useCreateCommand(
    KnownContexts.ModalAnnotate,
    KnownCommands.Redo,
    redoRef.current,
    () => {
      return redoEnabledRef.current;
    },
    "Redo",
    "Redoes the previous command."
  );

  useKeyBindings(KnownContexts.ModalAnnotate, [
    {
      sequence: "Delete",
      command: {
        commandId: KnownCommands.ModalDeleteAnnotation,
        handler: () => {
          const currentLabel = labelRef.current;
          const notify = setNotificationRef.current;

          if (!currentLabel) return;

          return new DelegatingUndoable(
            "delete.undoable",
            async () => {
              if (currentLabel.isNew) {
                if (scene && !scene.isDestroyed && scene.renderLoopActive) {
                  scene.exitInteractiveMode();
                  removeOverlay(currentLabel.data._id, true);
                }
                exit();
                return;
              }

              try {
                const fieldSchema = getFieldSchema(schema, currentLabel.path);
                if (!fieldSchema) {
                  notify({
                    msg: `Unable to delete label: field schema not found for path "${currentLabel.path}".`,
                    variant: "error",
                  });
                  return;
                }

                await commandBus.execute(
                  new DeleteAnnotationCommand(currentLabel, fieldSchema)
                );

                removeLabelFromSidebar(currentLabel.data._id);
                removeOverlay(currentLabel.overlay.id, false);

                notify({
                  msg: `Label "${currentLabel.data.label}" successfully deleted.`,
                  variant: "success",
                });

                exit();
              } catch (error) {
                console.error(error);
                notify({
                  msg: `Label "${
                    currentLabel.data.label ?? "Label"
                  }" not successfully deleted. Try again.`,
                  variant: "error",
                });
              }
            },
            async () => {
              try {
                const fieldSchema = getFieldSchema(schema, currentLabel.path);
                if (!fieldSchema) {
                  notify({
                    msg: `Error restoring deleted label. "${currentLabel.path}".`,
                    variant: "error",
                  });
                  return;
                }

                scene?.addOverlay(currentLabel.overlay);
                addLabelToSidebar(currentLabel);
              } catch (error) {
                console.error(error);
                notify({
                  msg: `Label "${
                    currentLabel.data.label ?? "Label"
                  }" not restored during undo. Try again.`,
                  variant: "error",
                });
              }
            }
          );
        },
        enablement: () => {
          return !!labelRef.current;
        },
        label: "Delete label",
        description: "Delete label",
      },
    },
    {
      sequence: "ctrl+z",
      command: undoCommand.descriptor.id,
    },
    {
      sequence: "meta+z",
      command: undoCommand.descriptor.id,
    },
    {
      sequence: "ctrl+shift+z",
      command: redoCommand.descriptor.id,
    },
    {
      sequence: "meta+shift+z",
      command: redoCommand.descriptor.id,
    },
  ]);
}
