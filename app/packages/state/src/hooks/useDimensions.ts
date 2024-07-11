import { throttle } from "lodash";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

const DIMENSION_REFRESH_THROTTLE = 250;

type Dimensions = { width: number; height: number };

export default function useDimensions() {
  const [bounds, update] = useState<Dimensions>(null);
  const ref = useRef<HTMLElement>();
  const widthRef = useRef<HTMLElement>();
  const heightRef = useRef<HTMLElement>();

  function refresh() {
    if (!ref.current && !widthRef.current && !heightRef.current) return;
    let height, width;
    if ((!widthRef.current || !heightRef.current) && ref.current) {
      height = ref.current.getBoundingClientRect().height;
      width = ref.current.getBoundingClientRect().width;
    }
    if (widthRef.current) {
      width = widthRef.current.getBoundingClientRect().width;
    }
    if (heightRef.current) {
      height = heightRef.current.getBoundingClientRect().height;
    }
    update({ width, height });
  }

  const throttledRefresh = useMemo(() => {
    return throttle(() => {
      refresh();
    }, DIMENSION_REFRESH_THROTTLE);
  }, []);

  const ro = useMemo(() => {
    return new ResizeObserver(throttledRefresh);
  }, [throttledRefresh]);

  useLayoutEffect(() => {
    if (ref.current) {
      refresh();
      ro.observe(ref.current);
    }
  }, [ro, ref.current]); // eslint-disable-line

  return { bounds, ref, heightRef, widthRef, update, refresh };
}
