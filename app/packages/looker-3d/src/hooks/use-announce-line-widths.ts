import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";
import { LINE_WIDTHS_EVENT, type Looker3dE2EEvents } from "../constants";

/**
 * Dispatches {@link LINE_WIDTHS_EVENT} with the line widths the main panel's
 * labels render with, once they have committed to the scene
 */
export const useAnnounceLineWidths = (
  cuboid: number,
  polyline: number,
  isMainPanel: boolean,
): void => {
  useEffect(() => {
    if (!isMainPanel) return;
    getEventBus<Looker3dE2EEvents>().dispatch(LINE_WIDTHS_EVENT, {
      cuboid,
      polyline,
    });
  }, [cuboid, polyline, isMainPanel]);
};
