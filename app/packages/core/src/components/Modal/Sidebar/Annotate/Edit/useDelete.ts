import { DeleteAnnotationCommand, getFieldSchema } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/commands";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
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
  const setSaving = useSetAtom(isSavingAtom);
  const setNotification = fos.useNotification();

  return useCallback(async () => {
    if (!label) {
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
      await commandBus.execute(
        new DeleteAnnotationCommand(label, getFieldSchema(schema, label?.path)!)
      );

      removeOverlay(label.overlay.id);
      setter();
      setSaving(false);
      setNotification({
        msg: `Label "${label.data.label ?? "Label"}" successfully deleted.`,
        variant: "success",
      });
      exit();
    } catch (error) {
      setSaving(false);
      setNotification({
        msg: `Label "${
          label.data.label ?? "Label"
        }" not successfully deleted. Try again.`,
        variant: "error",
      });
    }
  }, [
    commandBus,
    label,
    scene,
    schema,
    exit,
    removeOverlay,
    setter,
    setSaving,
    setNotification,
  ]);
}
