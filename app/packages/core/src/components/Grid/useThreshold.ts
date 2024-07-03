import { useRecoilCallback } from "recoil";
import { gridZoom } from "./recoil";

export default () => {
  return useRecoilCallback(
    ({ snapshot }) =>
      (width: number) => {
        const zoom = snapshot.getLoadable(gridZoom).getValue();
        let min = 7;

        if (width >= 1200) {
          min = 0;
        } else if (width >= 1000) {
          min = 2;
        } else if (width >= 800) {
          min = 4;
        }

        return 11 - Math.max(min, zoom);
      },
    []
  );
};
