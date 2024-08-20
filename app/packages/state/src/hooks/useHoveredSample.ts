import { Sample } from "@fiftyone/looker";
import { useSetRecoilState } from "recoil";
import * as fos from "../..";

export default function useHoveredSample(
  sample: Sample,
  args?: { update?: () => void; clear?: () => void }
) {
  const setSample = useSetRecoilState(fos.hoveredSample);
  function onMouseEnter() {
    setSample(sample);
    args?.update?.();
  }
  function onMouseLeave() {
    setSample(null);
    args?.clear?.();
  }
  function onMouseMove() {
    setSample(sample);
    args?.update?.();
  }

  return { handlers: { onMouseEnter, onMouseLeave, onMouseMove } };
}
