import { useRecoilCallback } from "recoil";
import { patching } from "../recoil";
import useSetView from "./useSetView";

export default function useToClips() {
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
      async (field) => {
        set(patching, true);
        setView(
          (v) => v,
          [
            {
              _cls: "fiftyone.core.stages.ToClips",
              kwargs: [
                ["field_or_expr", field],
                ["_state", null],
              ],
            },
          ]
        );
      },
    []
  );
}
