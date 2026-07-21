import type { CSSProperties } from "react";

import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "../shared/style-tokens";

const HUD_BORDER_RADIUS_PX = 4;
// Matches the in-scene measurement overlay color (MeasurementLayer).
const MEASUREMENT_ACCENT_COLOR = "#ffc857";
const HUD_FONT_SIZE_PX = 11;
const HUD_LINE_HEIGHT = 1;
const HUD_OFFSET_PX = 8;
const STATUS_FONT_SIZE_PX = 13;
const STATUS_PADDING_PX = 16;

export const styles: Record<string, CSSProperties> = {
  canvas: {
    display: "block",
    height: "100%",
    width: "100%",
  },
  hud: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    fontSize: HUD_FONT_SIZE_PX,
    lineHeight: HUD_LINE_HEIGHT,
    padding: "5px 7px",
    position: "absolute",
    right: HUD_OFFSET_PX,
    top: HUD_OFFSET_PX,
  },
  panel: {
    background: VISUALIZATION_PANEL_BACKGROUND_COLOR,
    boxSizing: "border-box",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  status: {
    alignItems: "center",
    color: VISUALIZATION_STATUS_TEXT_COLOR,
    display: "flex",
    fontSize: STATUS_FONT_SIZE_PX,
    inset: 0,
    justifyContent: "center",
    padding: STATUS_PADDING_PX,
    position: "absolute",
    textAlign: "center",
  },
  controls: {
    alignItems: "flex-end",
    bottom: HUD_OFFSET_PX,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    position: "absolute",
    right: HUD_OFFSET_PX,
    zIndex: 1,
  },
  recenter: {
    alignItems: "center",
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    cursor: "pointer",
    display: "inline-flex",
    height: 24,
    justifyContent: "center",
    padding: 0,
    width: 24,
  },
  measureToggle: {
    alignItems: "center",
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    cursor: "pointer",
    display: "inline-flex",
    height: 24,
    justifyContent: "center",
    padding: 0,
    width: 24,
  },
  measureToggleActive: {
    alignItems: "center",
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${MEASUREMENT_ACCENT_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: MEASUREMENT_ACCENT_COLOR,
    cursor: "pointer",
    display: "inline-flex",
    height: 24,
    justifyContent: "center",
    padding: 0,
    width: 24,
  },
  measureReadout: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    fontSize: HUD_FONT_SIZE_PX,
    fontVariantNumeric: "tabular-nums",
    lineHeight: HUD_LINE_HEIGHT,
    padding: "5px 7px",
  },
  legend: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    display: "flex",
    flexDirection: "column",
    fontSize: HUD_FONT_SIZE_PX,
    gap: 6,
    left: HUD_OFFSET_PX,
    lineHeight: HUD_LINE_HEIGHT,
    padding: "5px 7px",
    position: "absolute",
    top: HUD_OFFSET_PX,
  },
  legendEntry: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  legendLabel: {
    fontSize: HUD_FONT_SIZE_PX,
  },
  legendBar: {
    borderRadius: 2,
    height: 7,
    width: 96,
  },
  legendRange: {
    display: "flex",
    fontSize: HUD_FONT_SIZE_PX - 1,
    fontVariantNumeric: "tabular-nums",
    justifyContent: "space-between",
    opacity: 0.8,
  },
  controlIcon: {
    flex: "0 0 auto",
    height: 13,
    width: 13,
  },
};
