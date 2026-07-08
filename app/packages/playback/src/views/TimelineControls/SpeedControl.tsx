import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";
import { MAX_SPEED, MIN_SPEED } from "../../lib/constants";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { useSpeed } from "../../lib/playback/use-playback-state";
import styles from "./TimelineControls.module.css";

// A drag this small counts as a click (open for typing) rather than a scrub.
// Matches the timeline ruler's click/drag threshold so the two feel alike.
const CLICK_PX_THRESHOLD = 3;
// Pixels of vertical drag that double (up) or halve (down) the speed. Speed is
// a ratio, so a multiplicative mapping feels consistent across the whole range
// where a fixed px-per-unit step would be coarse near MIN and twitchy near MAX.
const PX_PER_DOUBLING = 130;
// Arrow-key / nudge factor.
const NUDGE_FACTOR = 1.1;

/** `1` -> "1×", `0.25` -> "0.25×". */
const fmtSpeed = (n: number): string => `${n}×`;

/** Round to 2dp and clamp into the valid `(0, MAX_SPEED]` range. */
const roundSpeed = (n: number): number =>
  Math.min(Math.max(Math.round(n * 100) / 100, MIN_SPEED), MAX_SPEED);

/** Parse a user string like "2", "2x", "2×" into a speed, or null if invalid. */
const parseSpeed = (raw: string): number | null => {
  const cleaned = raw.replace(/[×x\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Scrubbable playback-speed input for the modern timeline controls. Reads the
 * live `speedAtom` via `useSpeed()` (re-renders only on speed change, not per
 * RAF tick) and writes through `usePlayback().setSpeed`.
 *
 * Three ways to change the value, all on one field:
 * - drag vertically to scrub (multiplicative; up = faster),
 * - click to type an exact value (Enter / blur commits, Escape reverts),
 * - double-click to reset to 1×.
 *
 * The scrub engages the Pointer Lock API once a real drag starts, so movement
 * deltas keep flowing even when the cursor would otherwise hit the bottom of
 * the screen — the controls sit near the modal's bottom edge, where a plain
 * pointer-capture drag runs out of runway. Falls back to unlocked movement
 * deltas where Pointer Lock is unavailable.
 */
const SpeedControl: React.FC = () => {
  const speed = useSpeed();
  const { setSpeed } = usePlayback();

  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // Latest speed, readable from the drag's native listeners without re-binding
  // them each render.
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // Teardown for an in-flight drag, invoked on pointer-up and on unmount so a
  // drag interrupted by an unmount doesn't leak window listeners / a lock.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  // Focus + select-all once the input flips to editable, so typing overwrites.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const beginEdit = () => {
    setDraft(String(speedRef.current));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseSpeed(draft);
    // Invalid / empty input reverts to the committed speed (display re-reads it).
    if (parsed !== null) setSpeed(roundSpeed(parsed));
    setEditing(false);
  };

  const nudge = (dir: 1 | -1) => {
    const base = editing ? (parseSpeed(draft) ?? speed) : speed;
    const next = roundSpeed(base * NUDGE_FACTOR ** dir);
    if (editing) setDraft(String(next));
    setSpeed(next);
  };

  const onScrubStart = (e: React.PointerEvent<HTMLInputElement>) => {
    // While already editing, leave pointer handling to the text field so caret
    // placement / selection work normally.
    if (editing) return;
    // Suppress the focus + caret a pointer-down on an input would trigger; we
    // decide click-vs-scrub on pointer-up and focus manually if it was a click.
    e.preventDefault();

    const target = e.currentTarget;
    const startSpeed = speedRef.current;
    let accum = 0; // signed movement since start (negative = up = faster)
    let moved = 0; // total travel, for the click-vs-scrub decision
    let locked = false;

    const onMove = (ev: PointerEvent) => {
      const dy = ev.movementY || 0;
      accum += dy;
      moved += Math.abs(dy);
      if (moved < CLICK_PX_THRESHOLD) return;
      if (!locked) {
        // Engage Pointer Lock only once we know it's a real drag, so a plain
        // click never hides the cursor. Best-effort: unlocked deltas still work
        // until the cursor reaches a screen edge.
        try {
          target.requestPointerLock?.();
        } catch {
          /* Pointer Lock unavailable — keep dragging unlocked. */
        }
        locked = true;
      }
      setSpeed(roundSpeed(startSpeed * 2 ** (-accum / PX_PER_DOUBLING)));
    };

    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", end);
      if (locked) document.exitPointerLock?.();
      endDragRef.current = null;
    };

    const onUp = () => {
      end();
      // A pointer-up that never moved far is a click → open for typing.
      if (moved < CLICK_PX_THRESHOLD) beginEdit();
    };

    endDragRef.current = end;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      role="spinbutton"
      aria-label="Playback speed"
      aria-valuenow={speed}
      aria-valuemin={MIN_SPEED}
      aria-valuemax={MAX_SPEED}
      data-testid="timeline-controls-speed"
      className={clsx(styles.speed, styles.speedInput)}
      readOnly={!editing}
      value={editing ? draft : fmtSpeed(speed)}
      onChange={(e) => setDraft(e.target.value)}
      onPointerDown={onScrubStart}
      onDoubleClick={() => {
        setEditing(false);
        setSpeed(1);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          nudge(1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          nudge(-1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (editing) commit();
          else beginEdit();
        } else if (e.key === "Escape" && editing) {
          e.preventDefault();
          setEditing(false);
        }
      }}
      onBlur={() => {
        if (editing) commit();
      }}
    />
  );
};

export default SpeedControl;
