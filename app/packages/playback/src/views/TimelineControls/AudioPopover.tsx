import { Button, Size, Variant } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "../stableIcons";
import styles from "./TimelineControls.module.css";

export interface AudioPopoverProps {
  /** Rendered as the toggle button's icon. */
  icon: React.FC;
  ariaLabel: string;
  /** Extra classes for the trigger button (e.g. on/off mute coloring). */
  triggerClassName?: string;
  /** Extra classes for the panel (width lives here). */
  panelClassName?: string;
  /**
   * Disables the trigger so the panel cannot be opened — used when audio
   * has failed and there is nothing meaningful to adjust.
   */
  disabled?: boolean;
  /**
   * Renders an explicit close button in the panel corner. Worth it for a
   * dense panel like the mixer; noise for a single-fader popover, which
   * closes fine on outside click / Escape.
   */
  closable?: boolean;
  "data-testid"?: string;
  children: React.ReactNode;
}

/**
 * Popover anchored above its trigger, opening upward (these live in the
 * timeline's bottom toolbar).
 *
 * Deliberately NOT voodo's `Dropdown`, for three reasons this panel hit:
 *  - `Dropdown` renders through HeadlessUI's `Menu`, whose `useClose()` is
 *    resolved from `@voxel51/voodo`'s OWN copy of `@headlessui/react`. A
 *    close button built here reads a different module instance's context,
 *    so it silently no-ops.
 *  - `Menu.Items` portals to `document.body`, but React portals still
 *    bubble events through the REACT tree — so clicks inside the panel
 *    reached `TimelineControls`' row-level `onClick` and toggled the track
 *    drawer. This owns its DOM, and stops propagation explicitly.
 *  - The menu panel hard-caps at `max-w-[20rem]`, which squeezed the
 *    mixer's sliders down to nothing.
 */
const AudioPopover: React.FC<AudioPopoverProps> = ({
  icon,
  ariaLabel,
  triggerClassName,
  panelClassName,
  disabled = false,
  closable = false,
  "data-testid": testId,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Viewport coordinates for the portalled panel. An absolutely-positioned
  // panel inside the toolbar loses to the mosaic no matter how high its
  // z-index goes: ancestors between them create their own stacking
  // contexts, so the comparison never happens at the top level. Portalling
  // to `document.body` and positioning with `fixed` takes it out of those
  // contexts entirely.
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const updateAnchorRect = useCallback(() => {
    const trigger = rootRef.current;
    if (trigger) setAnchorRect(trigger.getBoundingClientRect());
  }, []);

  // Move focus into the panel when it opens, and back to the trigger when
  // it closes, so the popover is reachable and escapable by keyboard.
  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
      return undefined;
    }
    return undefined;
  }, [open, anchorRect]);

  // Re-anchor while open: the timeline moves when the track drawer opens
  // or the window resizes, and a `fixed` panel doesn't follow on its own.
  useEffect(() => {
    if (!open) return undefined;
    updateAnchorRect();
    window.addEventListener("resize", updateAnchorRect);
    window.addEventListener("scroll", updateAnchorRect, true);
    return () => {
      window.removeEventListener("resize", updateAnchorRect);
      window.removeEventListener("scroll", updateAnchorRect, true);
    };
  }, [open, updateAnchorRect]);

  // Close on outside click / Escape — the affordances HeadlessUI would
  // normally provide.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Capture phase: a sibling popover's panel stops propagation on its own
    // pointer events (it must, to keep clicks off the drawer toggle), which
    // would otherwise prevent this bubble-phase listener from ever seeing
    // the click — so clicking the volume button with the mixer open left
    // both panels showing. Capture runs before any bubble-phase
    // stopPropagation can interfere.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // The timeline controls row toggles the track drawer on any click that isn't on
  // an interactive element; this panel is full of them, so stop every
  // pointer/click event from reaching it.
  const stopPropagation = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  return (
    // No stopPropagation on the trigger itself: `TimelineControls`' row
    // click-to-toggle already ignores clicks that land on a `button`, and
    // swallowing the event here kept sibling popovers from seeing it.
    <span ref={rootRef} className={styles.popoverRoot}>
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        className={clsx(styles.iconButton, triggerClassName)}
        data-testid={testId}
        leadingIcon={icon}
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          updateAnchorRect();
          setOpen((current) => !current);
        }}
      />
      {open && !disabled && anchorRect
        ? createPortal(
            <div
              ref={panelRef}
              className={clsx(styles.popoverPanel, panelClassName)}
              role="dialog"
              // Portalled to the end of <body>, so without an explicit
              // focus move a keyboard user would Tab past the trigger into
              // the rest of the toolbar rather than into the panel.
              aria-label={ariaLabel}
              tabIndex={-1}
              // Left-aligned to the trigger and opening upward, in viewport
              // coordinates since this is `position: fixed`.
              //
              // Left, not right: these triggers used to sit in the toolbar's
              // right-hand trailing group, where pinning the panel's right
              // edge kept a wide panel on screen. They now sit just after the
              // transport buttons, near the left edge — pinning the right edge
              // there throws the panel out to the left of its own button.
              // `maxWidth` keeps the other end on screen without needing to
              // measure the panel first.
              style={{
                bottom: `${window.innerHeight - anchorRect.top + 6}px`,
                left: `${anchorRect.left}px`,
                maxWidth: `calc(100vw - ${Math.round(anchorRect.left)}px - 12px)`,
              }}
              onClick={stopPropagation}
              onPointerDown={stopPropagation}
            >
              {closable ? (
                <Button
                  variant={Variant.Icon}
                  size={Size.Xs}
                  className={clsx(styles.iconButton, styles.popoverClose)}
                  data-testid={testId ? `${testId}-close` : undefined}
                  leadingIcon={CloseIcon}
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                />
              ) : null}
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
};

export default AudioPopover;
