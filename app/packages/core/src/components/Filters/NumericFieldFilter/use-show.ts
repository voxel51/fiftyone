import * as fos from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import * as state from "./state";

export default function useShow(modal: boolean, named: boolean, path: string) {
  const queryPerformance = useReverbValue(fos.queryPerformance);
  const hasBounds = useReverbValue(
    state.hasBounds({
      path,
      modal,
      shouldCalculate: !queryPerformance || modal,
    }),
  );

  return hasBounds || (queryPerformance && !modal) || !named;
}
