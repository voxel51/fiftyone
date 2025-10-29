import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { getFieldSchema } from "../../../Lighter/deltas";
import { addValue, current, savedLabel } from "./state";

export default function useSave() {
  const { scene } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  return useCallback(() => {
    if (scene) {
      if (label?.data) {
        saved(label.data);
      }
      scene.dispatchSafely({
        type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
        detail: {
          label: { ...label },
          schema: getFieldSchema(schema, label.path),
          onSuccess: () => {
            setter();
          },
        },
      });
    }
  }, [label, saved, scene, schema, setter]);
}
