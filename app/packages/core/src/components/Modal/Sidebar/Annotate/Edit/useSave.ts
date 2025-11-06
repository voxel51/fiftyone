import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { getFieldSchema } from "../../../Lighter/deltas";
import { addValue, current, savedLabel } from "./state";
import useExit from "./useExit";

export const isSaving = atom(false);

export default function useSave() {
  const { scene, addOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const setSaving = useSetAtom(isSaving);
  const exit = useExit(false);
  const setNotification = fos.useNotification();

  return useCallback(() => {
    if (!scene || !label) {
      return;
    }

    setSaving(true);

    scene.dispatchSafely({
      type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
      detail: {
        label: { ...label },
        schema: getFieldSchema(schema, label.path),
        onSuccess: () => {
          setter();
          scene.exitInteractiveMode();
          addOverlay(label.overlay);
          saved(label.data);
          setSaving(false);
          exit();
          setNotification({
            msg: `Label "${label.data.label}" saved successfully.`,
            variant: "success",
          });
        },
        onError: () => {
          setSaving(false);
          setNotification({
            msg: `Label "${label.data.label}" not saved successfully. Try again.`,
            variant: "success",
          });
        },
      },
    });
  }, [
    addOverlay,
    exit,
    label,
    saved,
    scene,
    schema,
    setter,
    setNotification,
    setSaving,
  ]);
}
