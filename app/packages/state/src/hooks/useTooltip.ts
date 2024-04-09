import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";

export default function useTooltip() {
  const setIsControlKeyPressed = useSetRecoilState(
    fos.isTooltipControlKeyPressed
  );
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);
  const [isTooltipOn3DLabel, setIsTooltipOn3DLabel] = useRecoilState(
    fos.isTooltipOn3DLabel
  );
  const setTooltipCoordinates = useSetRecoilState(fos.tooltipCoordinates);

  const setCoords = useCallback(
    (coordinates: [number, number]) => {
      const coords = computeCoordinates(coordinates);
      setTooltipCoordinates(coords);
    },
    [setTooltipCoordinates]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      setCoords([e.pageX, e.pageY]);
    },
    [setCoords]
  );

  const registerMouseListener = useCallback(() => {
    window.addEventListener("mousemove", handleMouseMove);
    console.log("mouse listener added");
  }, [handleMouseMove]);

  const removeMouseListener = useCallback(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    console.log("removing mouse listener");
  }, [handleMouseMove]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Control") {
        console.log("control key pressed");
        setIsControlKeyPressed(true);
      }
    },
    [setIsControlKeyPressed]
  );

  useEffect(() => {
    if (!isTooltipOn3DLabel) {
      removeMouseListener();
    }
  }, [isTooltipOn3DLabel, removeMouseListener]);

  const handleKeyUp = useCallback(
    (e) => {
      if (e.key === "Control") {
        console.log("control key lifted up");
        setIsControlKeyPressed(false);
      }
    },
    [setIsControlKeyPressed]
  );

  const registerCtrlKeyListener = useCallback(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    console.log("key listeners added");
  }, [handleKeyDown, handleKeyUp]);

  const removeKeyListeners = useCallback(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    console.log("key listeners removed");
  }, [handleKeyDown, handleKeyUp]);

  const removeListeners = useCallback(() => {
    removeMouseListener();
    removeKeyListeners();
  }, [removeMouseListener, removeKeyListeners]);

  // only relevant for looker-3d
  const getMeshProps = useCallback(
    (label) => {
      return {
        onPointerOver: () => {
          setIsTooltipOn3DLabel(true);
          setTooltipDetail(getDetailsFromLabel(label));
        },
        onPointerOut: () => {
          setIsTooltipOn3DLabel(true);
        },
      };
    },
    [setTooltipDetail, setIsTooltipOn3DLabel]
  );

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

  return {
    getMeshProps,
    registerCtrlKeyListener,
    registerMouseListener,
    removeListeners,
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

export type ComputeCoordinatesReturnType = ReturnType<
  typeof computeCoordinates
>;
