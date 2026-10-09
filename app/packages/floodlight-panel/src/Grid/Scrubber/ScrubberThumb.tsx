import clsx from "clsx";
import { CSSProperties, FC, ReactNode } from "react";

import radiusStyles from "./radius";
import { bgColorClass, BrandColor, Orientation, Radius } from "@voxel51/voodo";

interface ScrubberThumbProps {
  /** Normalized position along the primary axis, in `[0, 1]`. */
  position: number;
  orientation: Orientation;
  /** Floating label shown next to the thumb. Omit to hide the label. */
  label?: ReactNode;
  /**
   * When `true` (hover or active scrub), the pin scales up slightly with a
   * short transition so users get tactile feedback on interaction.
   */
  active?: boolean;
  /**
   * When `true`, transitions the primary-axis position so external value
   * changes (e.g. the host scrolling the underlying content) glide instead
   * of jumping. Should be `false` while the user is actively dragging,
   * otherwise the pin lags behind the cursor.
   */
  animatePosition?: boolean;
}

/**
 * The draggable thumb overlaid on a {@link ScrubberTrack}.
 *
 * Positions itself absolutely along the primary axis; the cross-axis is
 * centered on the track. The optional label hovers in the gutter above
 * (horizontal) or beside (vertical) the thumb.
 *
 * @internal For use by {@link Scrubber}.
 */
export const ScrubberThumb: FC<ScrubberThumbProps> = ({
  position,
  orientation,
  label,
  active,
  animatePosition,
}) => {
  const horizontal = orientation === Orientation.Row;
  const pct = `${position * 100}%`;

  // Single transition string instead of the tailwind `transition-transform`
  // class so we can opt the position property in/out. During an active
  // drag we MUST NOT transition `top`/`left` — the pin would lag the
  // cursor and feel sticky.
  const transition = animatePosition
    ? `transform 300ms ease-out, ${horizontal ? "left" : "top"} 200ms ease-out`
    : "transform 300ms ease-out";

  // Pin: thin along the primary axis, long along the cross axis. The pin
  // anchors at the track's inward-facing edge and extends INTO the content
  // area — upward in Row mode (track sits at container bottom), leftward
  // in Column mode (track sits at container right).
  // Pin sized at rest; the active state scales it via GPU transform so
  // both thickness (1.4×) and length (1.67×, i.e. 30→50) ease in
  // together without layout thrash. `transformOrigin` keeps the pin
  // anchored at the inward edge of the track.
  const PIN_THICKNESS_PX = 5;
  const PIN_LENGTH_PX = 30;
  const SCALE_THICKNESS = 1.4;
  const SCALE_LENGTH = 50 / PIN_LENGTH_PX;

  const activeTransform = horizontal
    ? `scaleX(${SCALE_THICKNESS}) scaleY(${SCALE_LENGTH})`
    : `scaleY(${SCALE_THICKNESS}) scaleX(${SCALE_LENGTH})`;

  const thumbStyle: CSSProperties = horizontal
    ? {
        left: pct,
        bottom: "0",
        width: PIN_THICKNESS_PX,
        height: PIN_LENGTH_PX,
        transform: `translateX(-50%) ${active ? activeTransform : ""}`,
        transformOrigin: "bottom center",
        transition,
      }
    : {
        top: pct,
        right: "0",
        width: PIN_LENGTH_PX,
        height: PIN_THICKNESS_PX,
        transform: `translateY(-50%) ${active ? activeTransform : ""}`,
        transformOrigin: "center right",
        transition,
      };

  // Label is anchored at the *active* length so it doesn't jump as the
  // pin grows past it on hover.
  const labelOffsetPx = PIN_LENGTH_PX * SCALE_LENGTH + 8;
  const labelStyle: CSSProperties = horizontal
    ? {
        left: pct,
        bottom: `${labelOffsetPx}px`,
        transform: "translateX(-50%)",
      }
    : {
        top: pct,
        right: `${labelOffsetPx}px`,
        transform: "translateY(-50%)",
      };

  return (
    <>
      <div
        className={clsx(
          "absolute z-10 pointer-events-none",
          bgColorClass(BrandColor.Primary),
          radiusStyles(Radius.Full),
          "shadow-sm",
        )}
        style={thumbStyle}
      />
      {label !== undefined && (
        <div
          className={clsx(
            "absolute z-20 whitespace-nowrap pointer-events-none",
            "px-2 py-0.5 text-xs font-medium",
            bgColorClass(BrandColor.Primary),
            radiusStyles(Radius.Sm),
            "text-white shadow-md",
          )}
          style={labelStyle}
        >
          {label}
        </div>
      )}
    </>
  );
};

ScrubberThumb.displayName = "ScrubberThumb";
