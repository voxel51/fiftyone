import { getFieldSchema, useAnnotationActions } from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { current, deleteValue } from "./state";
import useExit from "./useExit";
import { isSaving } from "./useSave";

export default function useDelete() {
  const { scene, removeOverlay } = useLighter();
  const { deleteAnnotation } = useAnnotationActions();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const exit = useExit(false);
  const setSaving = useSetAtom(isSaving);
  const setNotification = fos.useNotification();

  return useCallback(() => {
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

    deleteAnnotation(
      label,
      getFieldSchema(schema, label?.path)!,
      () => {
        // onSuccess callback
        removeOverlay(label.overlay.id);
        setter();
        setSaving(false);
        setNotification({
          msg: `Label "${label.data.label ?? "Label"}" successfully deleted.`,
          variant: "success",
        });
        exit();
      },
      () => {
        // onError callback
        setSaving(false);
        setNotification({
          msg: `Label "${
            label.data.label ?? "Label"
          }" not successfully deleted. Try again.`,
          variant: "error",
        });
      }
    );
  }, [
    deleteAnnotation,
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
