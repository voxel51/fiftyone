import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { getFieldSchema } from "../../../Lighter/deltas";
import { current, deleteValue } from "./state";
import useExit from "./useExit";
import { isSaving } from "./useSave";

export default function useDelete() {
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const exit = useExit(false);
  const setSaving = useSetAtom(isSaving);

  return useCallback(() => {
    if (!label) {
      return;
    }

    if (label.isNew) {
      scene?.exitInteractiveMode();
      removeOverlay(label?.data._id);
      exit();
      return;
    }

    setSaving(true);
    scene?.dispatchSafely({
      type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
      detail: {
        label,
        schema: getFieldSchema(schema, label?.path)!,
        onSuccess: () => {
          removeOverlay(label?.overlay.id);
          setter();
          setSaving(false);
          exit();
        },
        onError: () => {
          setSaving(false);
        },
      },
    });
  }, [exit, label, scene, setter, removeOverlay, schema, setSaving]);
}
