import { PANEL_ID_MAIN } from "../constants";
import type { HoveredLabel } from "../types";

export const isHoverEligibleForPointCloudCrop = (
  hoveredLabel: HoveredLabel | null,
  isMainPanelPointerDown: boolean,
) => {
  if (!hoveredLabel) {
    return false;
  }

  if (!hoveredLabel.source || hoveredLabel.source === "sidebar") {
    return true;
  }

  return hoveredLabel.source === PANEL_ID_MAIN && !isMainPanelPointerDown;
};
