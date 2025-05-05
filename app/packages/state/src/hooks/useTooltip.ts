import {
  LabelHoveredEvent,
  LabelUnhoveredEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilCallback, useRecoilState, useSetRecoilState } from "recoil";

export default function useTooltip() {
  const [isTooltipLocked, setIsTooltipLocked] = useRecoilState(
    fos.isTooltipLocked
  );
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);
  const setTooltipCoordinates = useSetRecoilState(fos.tooltipCoordinates);

  const setCoords = useCallback((coordinates: [number, number]) => {
    const coords = computeCoordinates(coordinates);
    setTooltipCoordinates(coords);
  }, []);

  // only relevant for looker-3d
  const getMeshProps = useRecoilCallback(
    ({ snapshot }) =>
      (label) => {
        return {
          onPointerOver: () => {
            setTooltipDetail(getDetailsFromLabel(label));

            if (!label.instance) {
              return;
            }

            const sampleId = snapshot.getLoadable(fos.pinned3DSample).getValue()
              .sample._id;

            console.log(">>>sample id in 3d ", sampleId);

            selectiveRenderingEventBus.emit(
              new LabelHoveredEvent({
                sampleId,
                labelId: label.id,
                instanceId: label.instance._id,
                field: label.path,
                frameNumber: label.frame_number,
              })
            );
          },

          onPointerOut: () => {
            if (!isTooltipLocked) {
              setTooltipDetail(null);
            }

            if (!label.instance) {
              return;
            }

            selectiveRenderingEventBus.emit(new LabelUnhoveredEvent());
          },
          onPointerMissed: () => {
            if (!isTooltipLocked) {
              setTooltipDetail(null);
              setIsTooltipLocked(false);
            }
          },
          onPointerMove: (e: MouseEvent) => {
            if (isTooltipLocked) {
              return;
            }

            if (e.ctrlKey) {
              setIsTooltipLocked(true);
            } else {
              setCoords([e.clientX, e.clientY]);
            }
          },
        };
      },
    [setCoords, isTooltipLocked]
  );

  return {
    getMeshProps,
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

const getDetailsFromLabel = (label) => {
  const field = Array.isArray(label.path)
    ? [label.path.length - 1]
    : label.path;
  return {
    field,
    label,
    type: label.type,
    color: label.color,
    sampleId: label.sampleId,
  };
};

export type ComputeCoordinatesReturnType = ReturnType<
  typeof computeCoordinates
>;
