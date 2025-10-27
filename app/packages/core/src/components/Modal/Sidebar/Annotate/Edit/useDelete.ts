import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { getFieldSchema } from "../../../Lighter/deltas";
import { current, deleteValue } from "./state";

export default function useDelete() {
  const { scene, removeOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  return useCallback(() => {
    if (!label) {
      return;
    }
    setter();

    scene?.exitInteractiveMode();
    !label?.isNew &&
      scene?.dispatchSafely({
        type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
        detail: {
          label,
          schema: getFieldSchema(schema, label?.path)!,
        },
      });
    removeOverlay(label?.data._id);
  }, [label, scene, setter, removeOverlay, schema]);
}
