import { useReverbValue } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import { useBrainResult } from "./useBrainResult";

export function useBrainResultInfo() {
  const [brainKey] = useBrainResult();
  const dataset = useReverbValue(fos.dataset);

  if (brainKey && dataset) {
    const info = dataset.brainMethods.find((d) => d.key === brainKey);
    return info;
  }
  return null;
}
