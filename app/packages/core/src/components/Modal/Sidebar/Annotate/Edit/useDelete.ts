import {
  DeleteAnnotationCommand,
  getFieldSchema,
  useActiveAnnotationSampleId,
  useAnnotationEngine,
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
import { current } from "./state";
import useExit from "./useExit";

export default function useDelete() {
  const commandBus = useCommandBus();
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const engine = useAnnotationEngine();
  const sample = useActiveAnnotationSampleId();
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

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

          // the engine's read-half does the rest: the bridge loop unmounts
          // the overlay and the list mirror drops the row on the delete tick
          await commandBus.execute(
            new DeleteAnnotationCommand(label, fieldSchema)
          );

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

        // restore the captured label through the engine — the bridge loop
        // remounts the overlay and the list mirror restores the row (legacy
        // re-added the overlay and let the overlay-added handler write the
        // Sample; that handler is gone)
        engine.updateLabel(
          {
            sample,
            path: label.path,
            instanceId: label.data._id,
          },
          label.data
        );
      }
    );
  }, [
    commandBus,
    exit,
    label,
    removeOverlay,
    engine,
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
