import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { addValue, current, savedLabel } from "./state";
import { getFieldSchema } from "../../../Lighter/deltas";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

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
      scene.dispatchSafely({
        type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
        detail: {
          label: { ...label },
          schema: getFieldSchema(schema, label.path),
          onSuccess: () => {
            setter();
            if (label?.data) {
              saved(label.data);
            }
          },
        },
      });
    }
  }, [label, saved, scene, schema, setter]);
}
