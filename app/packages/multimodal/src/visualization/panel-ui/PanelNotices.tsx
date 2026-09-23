import { Icon, IconColor, IconName, Size } from "@voxel51/voodo";
import { useState, type CSSProperties, type PointerEvent } from "react";

import {
  VISUALIZATION_HUD_BACKGROUND_COLOR,
  VISUALIZATION_HUD_BORDER_COLOR,
  VISUALIZATION_HUD_TEXT_COLOR,
} from "./style-tokens";

/** Severity used to color a panel notice's compact status icon. */
export type PanelNoticeSeverity = "error" | "info" | "warning";
export type PanelNoticeScope = "image" | "scene" | "video";

/** One diagnostic shown in a panel's compact expandable notice control. */
export interface PanelNotice {
  readonly detail?: string;
  readonly id: string;
  readonly message: string;
  readonly severity: PanelNoticeSeverity;
}

/** Stable empty notice collection for optional panel notice props. */
export const EMPTY_PANEL_NOTICES: readonly PanelNotice[] = [];

/** Bottom-left notice count that expands without starting scene interaction. */
export function PanelNotices({
  notices,
  scope,
}: {
  readonly notices: readonly PanelNotice[];
  readonly scope: PanelNoticeScope;
}) {
  const [expanded, setExpanded] = useState(false);

  if (notices.length === 0) {
    return null;
  }
  const severity = worstSeverity(notices);

  return (
    <div onPointerDown={stopSceneInteraction} style={styles.root}>
      {expanded ? (
        <ul aria-label={`${scope} notices`} style={styles.list}>
          {notices.map((notice) => (
            <li key={notice.id} style={styles.item}>
              <div>{notice.message}</div>
              {notice.detail ? (
                <div style={styles.detail}>{notice.detail}</div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        aria-expanded={expanded}
        aria-label={`${notices.length} ${scope} ${
          notices.length === 1 ? "notice" : "notices"
        }`}
        onClick={() => setExpanded((current) => !current)}
        style={styles.toggle}
        title={`${expanded ? "Hide" : "Show"} ${scope} notices`}
        type="button"
      >
        <Icon
          color={NOTICE_SEVERITY_ICON_COLOR[severity]}
          name={NOTICE_SEVERITY_ICON[severity]}
          size={Size.Xs}
          style={styles.icon}
        />
        {notices.length}
      </button>
    </div>
  );
}

function stopSceneInteraction(event: PointerEvent<HTMLDivElement>) {
  event.stopPropagation();
}

function worstSeverity(notices: readonly PanelNotice[]): PanelNoticeSeverity {
  let worst: PanelNoticeSeverity = "info";
  for (const notice of notices) {
    if (notice.severity === "error") return "error";
    if (notice.severity === "warning") worst = "warning";
  }
  return worst;
}

const HUD_BORDER_RADIUS_PX = 4;
const HUD_FONT_SIZE_PX = 11;
const HUD_OFFSET_PX = 8;

const NOTICE_SEVERITY_ICON: Record<PanelNoticeSeverity, IconName> = {
  error: IconName.Error,
  info: IconName.Info,
  warning: IconName.Warning,
};

const NOTICE_SEVERITY_ICON_COLOR: Record<PanelNoticeSeverity, IconColor> = {
  error: IconColor.Failure,
  info: IconColor.Info,
  warning: IconColor.Warning,
};

const styles: Record<string, CSSProperties> = {
  root: {
    alignItems: "flex-start",
    bottom: HUD_OFFSET_PX,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    left: HUD_OFFSET_PX,
    maxWidth: "calc(100% - 16px)",
    position: "absolute",
    zIndex: 2,
  },
  toggle: {
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
  icon: {
    flex: "0 0 auto",
    height: 13,
    width: 13,
  },
  list: {
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
  item: { margin: 0 },
  detail: { margin: 0, opacity: 0.75 },
};
