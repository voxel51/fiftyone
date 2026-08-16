import clsx from "clsx";
import React, { useCallback, useEffect, useRef } from "react";
import styles from "./TimelineControls.module.css";

export interface VerticalFaderProps {
  /** Current value, in [0, 1]. */
  value: number;
  /** Renders the fill in the "off" (gray) color instead of "on" (orange). */
  muted?: boolean;
  disabled?: boolean;
  onChange(next: number): void;
  ariaLabel: string;
  "data-testid"?: string;
}

const KEY_STEP = 0.05;

/**
 * A vertical drag fader. voodo's `Slider`/`SliderBar` is horizontal-only —
 * its drag math reads `e.clientX` directly against the track's bounding
 * rect, so wrapping it in a CSS `rotate()` would desync the drag gesture
 * from the visual orientation (dragging up/down wouldn't move the knob).
 * This is a small, self-contained vertical equivalent using `clientY`.
 */
const VerticalFader: React.FC<VerticalFaderProps> = ({
  value,
  muted = false,
  disabled = false,
  onChange,
  ariaLabel,
  "data-testid": testId,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const valueFromClientY = useCallback((clientY: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    // Top of the track is 1 (max), bottom is 0 (min) — standard fader
    // convention (pushing up increases the level).
    const relative = 1 - (clientY - rect.top) / rect.height;
    return Math.min(1, Math.max(0, relative));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      onChange(valueFromClientY(e.clientY));

      const handleMove = (moveEvent: PointerEvent) => {
        onChange(valueFromClientY(moveEvent.clientY));
      };
      const release = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", release);
        // `pointercancel` fires instead of `pointerup` when the browser
        // takes over the gesture (touch interruption, scroll takeover);
        // without it the drag never ends.
        document.removeEventListener("pointercancel", release);
        releaseDragRef.current = null;
      };
      releaseDragRef.current = release;
      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", release);
      document.addEventListener("pointercancel", release);
    },
    [disabled, onChange, valueFromClientY],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const dir =
        e.key === "ArrowUp" || e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowDown" || e.key === "ArrowLeft"
            ? -1
            : 0;
      if (!dir) return;
      e.preventDefault();
      onChange(Math.min(1, Math.max(0, value + dir * KEY_STEP)));
    },
    [disabled, onChange, value],
  );

  const clamped = Math.min(1, Math.max(0, value));

  return (
    <div
      ref={trackRef}
      className={clsx(styles.verticalFaderTrack, {
        [styles.verticalFaderDisabled]: disabled,
      })}
      data-testid={testId}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={clamped}
      aria-disabled={disabled}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <div
        className={clsx(styles.verticalFaderFill, {
          [styles.verticalFaderFillMuted]: muted,
        })}
        style={{ height: `${clamped * 100}%` }}
      />
      <div
        className={clsx(styles.verticalFaderKnob, {
          [styles.verticalFaderKnobMuted]: muted,
        })}
        style={{ bottom: `${clamped * 100}%` }}
      />
    </div>
  );
};

export default VerticalFader;
