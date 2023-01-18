import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useBrainResult } from "./useBrainResult";

export function useBrainResultInfo() {
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey] = useBrainResult();
  const dataset = useRecoilValue(fos.dataset);

  if (brainKey && dataset) {
    const info = dataset.brainMethods.find((d) => d.key === brainKey);
    return info;
  }
  return null;
}
