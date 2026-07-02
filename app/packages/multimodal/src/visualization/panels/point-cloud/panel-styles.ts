import type { CSSProperties } from "react";

import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
  VISUALIZATION_PANEL_BACKGROUND_COLOR,
  VISUALIZATION_STATUS_TEXT_COLOR,
} from "../style-tokens";

const HUD_BORDER_RADIUS_PX = 4;
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
  notices: {
    alignItems: "flex-start",
    bottom: HUD_OFFSET_PX,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    left: HUD_OFFSET_PX,
    maxWidth: "calc(100% - 16px)",
    position: "absolute",
  },
  noticesToggle: {
    alignItems: "center",
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: HUD_FONT_SIZE_PX,
    gap: 4,
    height: 24,
    justifyContent: "center",
    padding: "0 7px",
  },
  noticesIcon: {
    flex: "0 0 auto",
    height: 13,
    width: 13,
  },
  noticesList: {
    background: VISUALIZATION_HUD_BACKGROUND_COLOR,
    border: `1px solid ${VISUALIZATION_HUD_BORDER_COLOR}`,
    borderRadius: HUD_BORDER_RADIUS_PX,
    color: VISUALIZATION_HUD_TEXT_COLOR,
    display: "flex",
    flexDirection: "column",
    fontSize: HUD_FONT_SIZE_PX,
    gap: 4,
    lineHeight: 1.35,
    listStyle: "none",
    margin: 0,
    maxHeight: 160,
    overflowY: "auto",
    padding: "6px 8px",
  },
  noticesItem: {
    margin: 0,
  },
  noticesItemDetail: {
    margin: 0,
    opacity: 0.75,
  },
};

/**
 * Chip icon color per worst notice severity: info gray, warning amber
 * (the chip's historical color), error red.
 */
export const NOTICE_SEVERITY_ICON_COLORS: Record<
  "error" | "info" | "warning",
  string
> = {
  error: "#f87171",
  info: "#9ca3af",
  warning: "#facc15",
};
