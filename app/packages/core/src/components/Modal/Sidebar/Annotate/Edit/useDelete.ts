import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { current, deleteValue } from "./state";
import useExit from "./useExit";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { getFieldSchema } from "../../../Lighter/deltas";

export default function useDelete() {
  const { scene } = useLighter();
  const exit = useExit();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  return useCallback(() => {
    scene?.dispatchSafely({
      type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
      detail: {
        label,
        schema: getFieldSchema(schema, label.path),
        onSuccess: () => {
          scene.exitInteractiveMode();
          setter();
          exit();
        },
      },
    });
  }, [exit, label, scene, schema, setter]);
}
