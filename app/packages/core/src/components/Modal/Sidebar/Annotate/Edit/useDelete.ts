import {
  DeleteAnnotationCommand,
  getFieldSchema,
  useSampleInstance,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import { useLighter } from "@fiftyone/lighter";
import { isDetection3dOverlay, isPolyline3dOverlay } from "@fiftyone/looker-3d";
import * as fos from "@fiftyone/state";
import { isGeneratedView } from "@fiftyone/state";

import {
  DelegatingUndoable,
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { useLabelsContext } from "../useLabels";
import { current } from "./state";
import useExit from "./useExit";

export default function useDelete() {
  const commandBus = useCommandBus();
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const sample = useSampleInstance();
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const { removeLabelFromSidebar } = useLabelsContext();

  const exit = useExit();
  const setNotification = fos.useNotification();
  const isGenerated = useRecoilValue(isGeneratedView);

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

          exit();
        } catch (error) {
          // Persistence success/failure is surfaced by the shared annotation
          // activity toast (annotation:persistenceSuccess / :persistenceError);
          // don't show a duplicate legacy toast here.
          console.error(error);
        }
      },
      async () => {
        if (!label) {
          return;
        }

        // restore the captured label in the Sample — the engine's bridge
        // loop remounts the overlay and the list mirror restores the row
        // (legacy re-added the overlay and let the overlay-added handler
        // write the Sample; that handler is gone)
        sample.updateLabel(label.path, label.data);
      }
    );
  }, [
    commandBus,
    exit,
    label,
    removeLabelFromSidebar,
    removeOverlay,
    sample,
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
          // Disable delete for generated views (patches/clips/frames)
          if (!label || isGenerated) {
            return false;
          }

          const is3dLabel =
            isPolyline3dOverlay(label.data) || isDetection3dOverlay(label.data);

          if (is3dLabel) {
            // Todo: handled in useAnnotationActions.tsx, reconcile
            return false;
          }

          return !!label;
        },
        sequence: ["Delete", "Backspace"],
        label: "Delete label",
        description: "Delete label",
      },
    ],
    [undoable, isGenerated]
  );
}
