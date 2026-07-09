/**
 * Resting-pointer ("dwell") tracking for hover inspection over
 * canvas-rendered content that is too dense or too expensive for
 * per-primitive enter/leave events.
 *
 * Deliberately generic: this module owns only the pointer state machine —
 * the caller supplies what a dwell means (typically a raycast or other
 * hit test) and what invalidates its result. Cloud points are the first
 * consumer; any other dwell-inspectable scene content plugs in the same
 * way.
 */
export interface PointerDwellOptions {
  /** Milliseconds the pointer must rest before `onDwell` fires. */
  readonly dwellMs: number;
  /**
   * Movement beyond this (CSS px) from where a dwell fired invalidates
   * it; smaller movements just re-arm the timer, so micro-jitter neither
   * dismisses a shown result nor re-fires it.
   */
  readonly moveTolerancePx: number;
  /**
   * Fires when a fired dwell is invalidated — movement beyond tolerance,
   * a drag starting, the pointer leaving, wheel zoom shifting the content
   * under a resting cursor, or detach. Never fires without a preceding
   * `onDwell`, but callers should stay idempotent.
   */
  readonly onCancel: () => void;
  /** Fires once per rest, at the rested pointer position. */
  readonly onDwell: (clientX: number, clientY: number) => void;
}

/**
 * Watches `element` for the pointer coming to rest. Returns a detach
 * function that unbinds the listeners and cancels any fired dwell.
 */
export function attachPointerDwell(
  element: HTMLElement,
  { dwellMs, moveTolerancePx, onCancel, onDwell }: PointerDwellOptions,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  let firedAtX = 0;
  let firedAtY = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const cancelFired = () => {
    if (!fired) {
      return;
    }
    fired = false;
    onCancel();
  };

  const handlePointerMove = (event: PointerEvent) => {
    clearTimer();
    if (event.buttons !== 0) {
      // Mid-drag (orbit/pan) — no dwell, and any shown result is stale.
      cancelFired();
      return;
    }
    if (
      fired &&
      Math.hypot(event.clientX - firedAtX, event.clientY - firedAtY) >
        moveTolerancePx
    ) {
      cancelFired();
    }
    const { clientX, clientY } = event;
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      firedAtX = clientX;
      firedAtY = clientY;
      onDwell(clientX, clientY);
    }, dwellMs);
  };
  const handleInterrupt = () => {
    clearTimer();
    cancelFired();
  };

  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerdown", handleInterrupt);
  element.addEventListener("pointerleave", handleInterrupt);
  element.addEventListener("wheel", handleInterrupt, { passive: true });
  return () => {
    element.removeEventListener("pointermove", handlePointerMove);
    element.removeEventListener("pointerdown", handleInterrupt);
    element.removeEventListener("pointerleave", handleInterrupt);
    element.removeEventListener("wheel", handleInterrupt);
    clearTimer();
    cancelFired();
  };
}
