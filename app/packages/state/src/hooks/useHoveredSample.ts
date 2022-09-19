import { AppSample } from "../recoil";
import * as fos from "../..";
import { useSetRecoilState } from "recoil";

export default function useHoveredSample(
  sample: AppSample,
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
