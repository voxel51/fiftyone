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
<<<<<<< HEAD
   * Overlay rendered on top of the ruler row (position:relative wrapper).
   * Used by TemporalTagRangeOverlay to capture pointer events for range
   * selection — sits only over the ruler, not the controls row above.
   */
  rulerOverlay?: ReactNode;
  /** Injected into the controls row — use for feature-specific action buttons. */
  extraActions?: ReactNode;
=======
   * Optional content forwarded to {@link TimelineControls}' `controlsSlot`
   * slot — rendered between the playback control buttons and the playhead
   * time display. The video annotation surface slots its action toolbar
   * (Mark Keyframe / Propagate) here, per the mocks.
   */
  controlsSlot?: ReactNode;
>>>>>>> chore/va-hook-tests
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
<<<<<<< HEAD
  rulerOverlay,
  extraActions,
=======
  controlsSlot,
>>>>>>> chore/va-hook-tests
  children,
}) => {
  return (
    <div className={styles.root} data-testid="timeline-header-root">
<<<<<<< HEAD
      <TimelineControls onToggle={onToggle} extraActions={extraActions} />
      <TimelineRuler labelWidth={labelWidth} zoomRef={zoomRef} overlay={rulerOverlay} />
=======
      <TimelineControls onToggle={onToggle} controlsSlot={controlsSlot} />
      <TimelineRuler labelWidth={labelWidth} zoomRef={zoomRef} />
>>>>>>> chore/va-hook-tests
      {children ? <div className={styles.belowRuler}>{children}</div> : null}
    </div>
  );
};

export default TimelineHeader;
