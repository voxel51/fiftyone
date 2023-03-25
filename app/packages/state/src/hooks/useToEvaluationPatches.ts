import { useRecoilCallback } from "recoil";
import { patching } from "../recoil";
import useSetView from "./useSetView";

export default function useToEvaluationPatches() {
  const onComplete = useRecoilCallback(
    ({ set }) =>
      () => {
        set(patching, false);
      },
    []
  );
  const setView = useSetView(true, true, onComplete);
  return useRecoilCallback(
    ({ set }) =>
      async (evaluation) => {
        set(patching, true);
        setView(
          (v) => v,
          [
            {
              _cls: "fiftyone.core.stages.ToEvaluationPatches",
              kwargs: [
                ["eval_key", evaluation],
                ["_state", null],
              ],
            },
          ]
        );
      },
    []
  );
}
