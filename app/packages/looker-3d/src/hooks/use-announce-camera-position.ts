import { getEventBus } from "@fiftyone/events";
import { addAfterEffect } from "@react-three/fiber";
import { type RefObject, useEffect } from "react";
import type { Camera } from "three";
import { CAMERA_POSITION_EVENT, type Looker3dE2EEvents } from "../constants";

/**
 * After each rendered frame that shows the camera somewhere new, dispatches
 * {@link CAMERA_POSITION_EVENT} with its position. The status bar lags the
 * camera by a frame, so this is the position the canvas actually shows.
 */
export const useAnnounceCameraPosition = (
  cameraRef: RefObject<Camera | null>,
): void => {
  useEffect(() => {
    let last: readonly [number, number, number] | null = null;

    return addAfterEffect(() => {
      const position = cameraRef.current?.position;
      if (!position) return;

      const { x, y, z } = position;
      if (last && last[0] === x && last[1] === y && last[2] === z) return;

      last = [x, y, z];
      getEventBus<Looker3dE2EEvents>().dispatch(CAMERA_POSITION_EVENT, {
        x,
        y,
        z,
      });
    });
  }, [cameraRef]);
};
