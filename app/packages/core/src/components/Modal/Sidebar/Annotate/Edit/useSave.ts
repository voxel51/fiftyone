import { getFieldSchema, UpsertAnnotationCommand } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/commands";
import type { BaseOverlay } from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { addValue, current, savedLabel } from "./state";
import useExit from "./useExit";

export const isSavingAtom = atom(false);

export default function useSave() {
  const commandBus = useCommandBus();
  const { scene, addOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const [isSaving, setSaving] = useAtom(isSavingAtom);
  const exit = useExit(false);
  const setNotification = fos.useNotification();

  return useCallback(async () => {
    if (!label || isSaving) {
      return;
    }

    setSaving(true);

    try {
      await commandBus.execute(
        new UpsertAnnotationCommand(
          { ...label },
          getFieldSchema(schema, label.path)!
        )
      );

      setter();

      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        addOverlay(label.overlay as BaseOverlay);
      }

      saved(label.data);
      setSaving(false);
      exit();
      setNotification({
        msg: `Label "${label.data.label}" saved successfully.`,
        variant: "success",
      });
    } catch (error) {
      setSaving(false);
      setNotification({
        msg: `Label "${
          label.data.label ?? "Label"
        }" not saved successfully. Try again.`,
        variant: "error",
      });
    }
  }, [
    commandBus,
    label,
    isSaving,
    schema,
    scene,
    addOverlay,
    setter,
    saved,
    exit,
    setNotification,
  ]);
}
