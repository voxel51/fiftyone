import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Keeps the card open across the gap between the trigger and the portaled
 * card, so the pointer can travel into the card to reach its actions.
 */
const CLOSE_DELAY_MS = 120;

/** Default card width; wide enough for a title plus a line or two of copy. */
const DEFAULT_WIDTH = 320;

export interface HoverPopoverProps {
  /** Accessible name for the card. */
  label: string;
  /** The card. Mounted only while open, so it reads state at open time. */
  content: React.ReactNode;
  /** Card width in px. */
  width?: number;
  /** The trigger. Wrapped in an inline-flex span that owns the hover. */
  children: React.ReactNode;
}

/**
 * Hover-opened card anchored above its trigger.
 *
 * Deliberately not a `Tooltip`: it portals above both the annotation modal and
 * any clipping (`overflow: hidden`) ancestor, and it stays open while the
 * pointer is over the trigger OR the card so the card's links and buttons stay
 * clickable — a tooltip dismisses the moment the pointer leaves the trigger.
 * Held open by presence of the anchor `rect` (null = closed).
 *
 * The trigger may be disabled: the wrapper span owns the hover, since a
 * disabled control swallows its own pointer events.
 */
export const HoverPopover: React.FC<HoverPopoverProps> = ({
  label,
  content,
  width = DEFAULT_WIDTH,
  children,
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const open = () => {
    clearTimeout(closeTimer.current);

    if (anchorRef.current) {
      setRect(anchorRef.current.getBoundingClientRect());
    }
  };

  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setRect(null), CLOSE_DELAY_MS);
  };

  return (
    <span
      ref={anchorRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      {children}

      {rect &&
        createPortal(
          <div
            role="dialog"
            aria-label={label}
            onMouseEnter={open}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              // Anchor above the trigger: pin the card's bottom just over the
              // trigger's top so it grows upward (a toolbar sits low when the
              // timeline drawer is collapsed, which clips a downward card).
              bottom: window.innerHeight - rect.top + 6,
              left: rect.left,
              width,
              zIndex: "var(--z-above-modal)",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
};
