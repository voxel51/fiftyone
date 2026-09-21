import { Sample } from "@fiftyone/looker";
import { useSetReverbState } from "@fiftyone/reverb";
import * as fos from "../..";

export default function useHoveredSample(
  sample: Sample,
  args?: { update?: () => void; clear?: () => void },
) {
  const setSample = useSetReverbState(fos.hoveredSample);
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
