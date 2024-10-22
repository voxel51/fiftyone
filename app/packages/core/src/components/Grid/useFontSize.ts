import { useCallback } from "react";
import useThreshold from "./useThreshold";

const MAX = 32;
const MIN = 14;
const SCALE_FACTOR = 0.09;

export default (id: string) => {
  const threshold = useThreshold();

  return useCallback(() => {
    const width = document.getElementById(id)?.getBoundingClientRect().width;
    if (!width) {
      throw new Error("unexpected");
    }

    return Math.max(
      Math.min((width / threshold(width)) * SCALE_FACTOR, MAX),
      MIN
    );
  }, [id, threshold]);
};
