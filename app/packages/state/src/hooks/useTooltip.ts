import { useEffect } from "react";
import { atom, useRecoilState } from "recoil";

const tooltipState = atom({
  key: "tooltipState",
  default: { hovering: false },
});

export default function useTooltip() {
  const [{ hovering, coords, detail }, setState] = useRecoilState(tooltipState);
  function handleMouseMove(e) {
    setCoords([e.pageX, e.pageY]);
  }
  function removeListener() {
    window.removeEventListener("mousemove", handleMouseMove);
  }
  function getMeshProps(label) {
    return {
      onPointerOver: () => {
        setState((s) => ({
          ...s,
          hovering: true,
          detail: getDetailsFromLabel(label),
        }));
      },
      onPointerOut: () => {
        removeListener();
        setState((s) => ({ ...s, hovering: false, detail: null }));
      },
    };
  }
  function getDetailsFromLabel(label) {
    const field = label.path[label.path.length - 1];
    const { color, selected, ...labelToView } = label;
    return {
      field,
      label: labelToView,
      type: label._cls,
      color: label.color,
    };
  }

  function setDetail(detail) {
    setState((s) => ({ ...s, detail }));
  }
  function setCoords(coordinates) {
    const coords = computeCoordinates(coordinates);
    setState((s) => ({ ...s, coords }));
  }

  useEffect(() => {
    if (hovering) {
      window.addEventListener("mousemove", handleMouseMove);
    } else {
      removeListener();
    }

    return removeListener;
  }, [hovering]);

  return {
    showTooltip: hovering,
    coords,
    detail,
    getMeshProps,
    setDetail,
    setCoords,
  };
}

type placement = number | "unset";

function computeCoordinates([x, y]: [number, number]): {
  bottom?: placement;
  top?: placement;
  left?: placement;
  right?: placement;
} {
  let top: placement = y,
    bottom: placement = "unset";
  if (y > window.innerHeight / 2) {
    bottom = window.innerHeight - y;
    top = "unset";
  }

  return {
    bottom,
    top,
    left: x <= window.innerWidth / 2 ? x + 24 : "unset",
    right: x > window.innerWidth / 2 ? window.innerWidth - x + 24 : "unset",
  };
}
