import { DeleteAnnotationCommand, getFieldSchema } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { current, deleteValue } from "./state";
import useExit from "./useExit";
import { isSavingAtom } from "./useSave";

export default function useDelete() {
  const commandBus = useCommandBus();
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const exit = useExit(false);
  const [isSaving, setSaving] = useAtom(isSavingAtom);
  const setNotification = fos.useNotification();

  const onDelete = useCallback(async () => {
    if (!label || isSaving) {
      return;
    }

    if (label.isNew) {
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene?.exitInteractiveMode();
        removeOverlay(label?.data._id);
      }

      exit();
      return;
    }

    setSaving(true);

    try {
      const fieldSchema = getFieldSchema(schema, label?.path);
      if (!fieldSchema) {
        setSaving(false);
        setNotification({
          msg: `Unable to delete label: field schema not found for path "${label?.path ?? "unknown"
            }".`,
          variant: "error",
        });
        return;
      }

      await commandBus.execute(new DeleteAnnotationCommand(label, fieldSchema));

      setter();
      removeOverlay(label.overlay.id);
      setSaving(false);
      setNotification({
        msg: `Label "${label.data.label}" successfully deleted.`,
        variant: "success",
      });
      exit();
    } catch (error) {
      console.error(error);
      setSaving(false);
      setNotification({
        msg: `Label "${label.data.label ?? "Label"
          }" not successfully deleted. Try again.`,
        variant: "error",
      });
    }
  }, [
    commandBus,
    label,
    isSaving,
    scene,
    schema,
    exit,
    removeOverlay,
    setter,
    setSaving,
    setNotification,
  ]);
  return onDelete;
}

