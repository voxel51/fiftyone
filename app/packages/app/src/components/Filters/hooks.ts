import { useSpring } from "react-spring";
import useMeasure from "react-use-measure";

interface ExpandStyle {
  height: number;
}

export const useExpand = (
  expanded: boolean
): [(element: HTMLElement | null) => void, ExpandStyle] => {
  const [ref, { height }] = useMeasure();
  const props = useSpring({
    height: expanded ? height : 0,
    from: {
      height: 0,
    },
    config: {
      duration: 0,
    },
  });
  return [ref, props];
};
