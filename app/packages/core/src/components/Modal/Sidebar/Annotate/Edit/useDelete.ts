import { DeleteAnnotationCommand, getFieldSchema } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";

import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { current } from "./state";
import useExit from "./useExit";
import { useLabelsContext } from "../useLabels";
import {
  DelegatingUndoable,
  KnownCommands,
  KnownContexts,
  useKeyBindings,
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

  const undoable = useMemo(() => {
    return new DelegatingUndoable(
      "delete.undoable",
      async () => {
        if (!label) {
          return;
        }

        if (label.isNew) {
          if (scene && !scene.isDestroyed && scene.renderLoopActive) {
            scene?.exitInteractiveMode();
            removeOverlay(label?.data._id, true);
          }

          exit();
          return;
        }

        try {
          const fieldSchema = getFieldSchema(schema, label?.path);

          if (!fieldSchema) {
            setNotification({
              msg: `Unable to delete label: field schema not found for path "${
                label?.path ?? "unknown"
              }".`,
              variant: "error",
            });
            return;
          }

          await commandBus.execute(
            new DeleteAnnotationCommand(label, fieldSchema)
          );

          removeLabelFromSidebar(label.data._id);
          removeOverlay(label.overlay.id, false);

          setNotification({
            msg: `Label "${label.data.label}" successfully deleted.`,
            variant: "success",
          });

          exit();
        } catch (error) {
          console.error(error);
          setNotification({
            msg: `Label "${
              label.data.label ?? "Label"
            }" not successfully deleted. Try again.`,
            variant: "error",
          });
        }
      },
      async () => {
        if (label) {
          try {
            const fieldSchema = getFieldSchema(schema, label?.path);
            if (!fieldSchema) {
              setNotification({
                msg: `Error restoring deleted label. "${
                  label?.path ?? "unknown"
                }".`,
                variant: "error",
              });
              return;
            }

            scene?.addOverlay(label.overlay);
            addLabelToSidebar(label);
          } catch (error) {
            console.error(error);
            setNotification({
              msg: `Label "${
                label.data.label ?? "Label"
              }" not restored during undo. Try again.`,
              variant: "error",
            });
          }
        }
      }
    );
  }, [
    commandBus,
    exit,
    label,
    removeLabelFromSidebar,
    removeOverlay,
    scene,
    schema,
    setNotification,
  ]);

  useKeyBindings(
    KnownContexts.ModalAnnotate,
    [
      {
        commandId: KnownCommands.ModalDeleteAnnotation,
        handler: () => {
          return undoable;
        },
        enablement: () => {
          return !!label;
        },
        sequence: ["Delete", "Backspace"],
        label: "Delete label",
        description: "Delete label",
      },
    ],
    [undoable]
  );
}
