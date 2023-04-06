import { useRecoilCallback } from "recoil";
import { patching, selectedSamples } from "../recoil";
import useSetView from "./useSetView";

export default function useToPatches() {
  const onComplete = useRecoilCallback(
    ({ set }) =>
      () => {
        set(patching, false);
      },
    []
  );
  const setView = useSetView(true, true, onComplete);
  return useRecoilCallback(
    ({ set, reset }) =>
      async (field) => {
        set(patching, true);
        setView(
          (v) => v,
          [
            {
              _cls: "fiftyone.core.stages.ToPatches",
              kwargs: [
                ["field", field],
                ["_state", null],
              ],
            },
          ]
        );
        reset(selectedSamples);
      },
    []
  );
}
