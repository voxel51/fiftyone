import { getFieldSchema, useAnnotationActions } from "@fiftyone/annotation";
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
  const { scene, addOverlay } = useLighter();
  const { upsertAnnotation } = useAnnotationActions();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const [isSaving, setSaving] = useAtom(isSavingAtom);
  const exit = useExit(false);
  const setNotification = fos.useNotification();

  return useCallback(() => {
    if (!label || isSaving) {
      return;
    }

    setSaving(true);

    upsertAnnotation(
      { ...label },
      getFieldSchema(schema, label.path)!,
      () => {
        // onSuccess callback
        setter();

        if (scene && !scene.isDestroyed && scene.renderLoopActive) {
          scene.exitInteractiveMode();
          addOverlay(label.overlay as BaseOverlay);
        }

        saved(label.data);
        setSaving(false);
        exit();
        setNotification({
          msg: `Label "${label.data.label ?? "Label"}" saved successfully.`,
          variant: "success",
        });
      },
      () => {
        // onError callback
        setSaving(false);
        setNotification({
          msg: `Label "${
            label.data.label ?? "Label"
          }" not saved successfully. Try again.`,
          variant: "error",
        });
      }
    );
  }, [
    upsertAnnotation,
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
