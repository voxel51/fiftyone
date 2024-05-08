import { Sample } from "@fiftyone/looker";
import { useSetRecoilState } from "recoil";
import * as fos from "../..";

export default function useHoveredSample(
  sample: Sample,
  auxHandlers: any = {}
) {
  const setSample = useSetRecoilState(fos.hoveredSample);
  const { update, clear } = auxHandlers;
  function onMouseEnter() {
    setSample(sample);
    update && update();
  }
  function onMouseLeave() {
    setSample(null);
    clear && clear();
  }
  function onMouseMove() {
    setSample(sample);
    update && update();
  }

  return { handlers: { onMouseEnter, onMouseLeave, onMouseMove } };
}
