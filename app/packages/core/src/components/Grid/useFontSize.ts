import { useCallback } from "react";
import useZoomSetting from "./useZoomSetting";

const MAX = 14;
const MIN = 10;
const SCALE_FACTOR = 0.09;

export default (id: string) => {
  const zoom = useZoomSetting();

  return useCallback(() => {
    const width = document.getElementById(id)?.getBoundingClientRect().width;
    if (!width) {
      throw new Error("unexpected");
    }

    return Math.max(Math.min((width / zoom(width)) * SCALE_FACTOR, MAX), MIN);
  }, [id, zoom]);
};
