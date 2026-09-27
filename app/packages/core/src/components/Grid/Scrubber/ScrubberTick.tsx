import clsx from "clsx";
import { CSSProperties, FC, ReactNode } from "react";

import radiusStyles from "./radius";
import {
  BackgroundColor,
  bgColorClass,
  Orientation,
  Radius,
  textColorClass,
  TextColor,
} from "@voxel51/voodo";

interface ScrubberTickProps {
  /** Normalized position along the primary axis, in `[0, 1]`. */
  position: number;
  orientation: Orientation;
  /** Optional label rendered in the cross-axis gutter beside the tick. */
  label?: ReactNode;
  /** Whether this tick coincides with the current scrubber value. */
  active?: boolean;
  /**
   * Whether the tick label should be visible. The Scrubber sets this from
   * its own hover/scrub state so labels only appear when the user is
   * interacting with the pin — keeping the bar quiet at rest.
   */
  showLabel?: boolean;
}

/**
 * A single tick mark drawn perpendicular to the scrubber track, with an
 * optional label rendered just beyond the track in the cross-axis gutter.
 *
 * @internal For use by {@link Scrubber}.
 */
export const ScrubberTick: FC<ScrubberTickProps> = ({
  position,
  orientation,
  label,
  active,
  showLabel,
}) => {
  const horizontal = orientation === Orientation.Row;
  const pct = `${position * 100}%`;

  // The scrubber hugs the bottom (Row) or right (Column) of its container.
  // Tick marks and labels extend INWARD only — above the track in Row mode,
  // to the left of the track in Column mode — so nothing overflows the
  // hugged edge.
  const tickStyle: CSSProperties = horizontal
    ? {
        left: pct,
        bottom: "0",
        height: 8,
        width: 1,
        transform: "translateX(-50%)",
      }
    : {
        top: pct,
        right: "0",
        width: 8,
        height: 1,
        transform: "translateY(-50%)",
      };

  const labelStyle: CSSProperties = horizontal
    ? {
        left: pct,
        bottom: "calc(100% + 4px)",
        transform: "translateX(-50%)",
      }
    : {
        // Right edge of the label sits a small gap to the left of the
        // track. The label box hugs its text (no fixed width); labels
        // grow leftward naturally because we anchor the right edge.
        top: pct,
        right: "calc(100% + 4px)",
        transform: "translateY(-50%)",
      };

  return (
    <>
      <div
        className={clsx(
          "absolute pointer-events-none",
          // Always render ticks in the muted color. The thumb is the
          // source of truth for "current value" — coloring the tick under
          // the thumb the same primary brand color used to read as two
          // overlapping orange markers when the value happened to land on
          // a tick boundary.
          bgColorClass(BackgroundColor.Muted),
        )}
        style={tickStyle}
      />
      {label !== undefined && showLabel && (
        <div
          className={clsx(
            "absolute text-xs leading-none pointer-events-none whitespace-nowrap",
            // Subtle padded chip with a semi-transparent surface so the
            // label reads cleanly over grid content without fully blocking
            // the underlying view.
            "px-1.5 py-0.5",
            radiusStyles(Radius.Sm),
            bgColorClass(BackgroundColor.Card1),
            "opacity-90",
            // In Column mode the label sits to the left of the track. Right-
            // aligning anchors the text against the track so varying-length
            // labels grow leftward instead of drifting away.
            !horizontal && "text-right",
            // Lighter text — Primary in our scheme is the highest-contrast
            // value and reads as crisp white in dark mode.
            active ? "font-semibold" : "",
            textColorClass(TextColor.Primary),
          )}
          style={labelStyle}
        >
          {label}
        </div>
      )}
    </>
  );
};

ScrubberTick.displayName = "ScrubberTick";
