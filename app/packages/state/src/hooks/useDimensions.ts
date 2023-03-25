import { useState, useRef, useLayoutEffect, DOMElement } from "react";

type Dimensions = {
  width: number;
  height: number;
};

export default function useDimensions() {
  const [bounds, update] = useState<Dimensions>(null);
  const ref = useRef<HTMLElement>();

  function refresh() {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    update({ width, height });
  }

  const ro = new ResizeObserver(refresh);

  useLayoutEffect(() => {
    if (ref.current) {
      refresh();
      ro.observe(ref.current);
    }
  }, [ref.current]);

  return { bounds, ref, update, refresh };
}
