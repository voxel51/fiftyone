import { useRef, useState, useEffect, MutableRefObject } from "react";

function useHover<T extends HTMLElement = HTMLDivElement>(): [
  MutableRefObject<T | null>,
  boolean,
] {
  const [value, setValue] = useState(false);
  const ref = useRef<T | null>(null);
  const handleMouseOver = () => setValue(true);
  const handleMouseOut = () => setValue(false);

  useEffect(
    () => {
      const node = ref.current;
      if (node) {
        node.addEventListener("mouseover", handleMouseOver);
        node.addEventListener("mouseout", handleMouseOut);
        return () => {
          node.removeEventListener("mouseover", handleMouseOver);
          node.removeEventListener("mouseout", handleMouseOut);
        };
      }
      return undefined;
    },
    // re-attach when the ref's node has changed by the next render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [ref.current],
  );
  return [ref, value];
}

export default useHover;
