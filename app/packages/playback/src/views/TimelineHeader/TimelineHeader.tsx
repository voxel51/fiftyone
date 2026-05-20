import React, { type ReactNode } from "react";
import TimelineControls from "../TimelineControls/TimelineControls";
import TimelineRuler from "../TimelineRuler/TimelineRuler";
import styles from "./TimelineHeader.module.css";

export interface TimelineHeaderProps {
  /** Width of the label column shared between ruler and tracks. */
  labelWidth: number;
  /**
   * Container ref the ruler attaches wheel-to-zoom to. Lets users zoom from
   * anywhere in the surrounding area, not just over the ruler itself.
   */
  zoomRef: React.RefObject<HTMLElement | null>;
  /**
   * Invoked when the user clicks the controls row outside any interactive
   * element. Wire to the drawer's toggle to make the row act as a
   * "show / hide tracks" affordance.
   */
  onToggle?: () => void;
  /**
   * Content rendered below the ruler, still inside the always-visible
   * header region. Used by `TimelineWithTracks` to keep pinned tracks
   * on-screen even when the drawer body is collapsed.
   */
  children?: ReactNode;
}

/**
 * The always-visible top of a timeline: a row of playback controls plus the
 * ruler underneath, and an optional slot below the ruler for content that
 * should also persist when the drawer is closed (e.g. pinned tracks).
 * Designed to be passed as the `header` of a Drawer.
 */
const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  labelWidth,
  zoomRef,
  onToggle,
  children,
}) => {
  return (
    <div className={styles.root} data-testid="timeline-header-root">
      <TimelineControls onToggle={onToggle} />
      <TimelineRuler labelWidth={labelWidth} zoomRef={zoomRef} />
      {children ? <div className={styles.belowRuler}>{children}</div> : null}
    </div>
  );
};

export default TimelineHeader;
