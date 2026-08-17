import { HOVER_INTERVAL_MS } from "../constants";
import type { HoverHit } from "../types";

interface HoverCallbacks {
  /** True while another interaction owns the pointer (e.g. lasso) */
  isBlocked: () => boolean;
  /** Hit-test the pointer position; the chart owns the projection */
  pick: (x: number, y: number) => HoverHit | null;
  /** Hits fire debounced; null fires as soon as hover breaks */
  onHover: (hit: HoverHit | null) => void;
}

/**
 * Throttled hover: while the pointer moves, hit-tests run at most once
 * per HOVER_INTERVAL_MS, and the callback fires only when the result
 * CHANGES — a new point, a miss after a hit, or the same point under a
 * moved camera. Jitter over one point is silence, so the host's card
 * never flickers. Camera drags never trigger it (buttons are tracked
 * in capture phase so this stays true even when other handlers
 * stopPropagation), and camera changes without pointer movement —
 * wheel zooms — re-test via viewChanged().
 */
export class HoverPicker {
  private readonly callbacks: HoverCallbacks;
  private readonly listeners = new AbortController();
  private handle: number | null = null;
  /** Last idle pointer position (CSS px); null once the pointer leaves
   * or a drag starts (drag moves are filtered, so it would go stale) */
  private pointer: [number, number] | null = null;
  /** The hit the host is currently showing, for change detection */
  private shown: HoverHit | null = null;
  private buttonsDown = false;

  constructor(container: HTMLElement, callbacks: HoverCallbacks) {
    this.callbacks = callbacks;
    const { signal } = this.listeners;
    container.addEventListener(
      "pointerdown",
      () => {
        this.buttonsDown = true;
        // Drag moves never update the position (the buttons filter
        // below), so from here it describes where the pointer WAS — a
        // post-drag viewChanged() must not hit-test the pre-drag spot.
        // The next idle move re-seeds it.
        this.pointer = null;
        this.clear();
      },
      { capture: true, signal },
    );
    for (const type of ["pointerup", "pointercancel"] as const) {
      container.addEventListener(
        type,
        () => {
          this.buttonsDown = false;
        },
        { capture: true, signal },
      );
    }
    container.addEventListener(
      "pointermove",
      (event) => {
        if (this.callbacks.isBlocked() || event.buttons !== 0) return;
        this.pointer = [event.offsetX, event.offsetY];
        this.schedule();
      },
      { signal },
    );
    container.addEventListener(
      "pointerleave",
      () => {
        this.pointer = null;
        this.clear();
      },
      { signal },
    );
  }

  /** The view moved under a still pointer; hide and re-test after settle */
  viewChanged(): void {
    if (this.buttonsDown) this.clear();
    else this.schedule();
  }

  /** New data: the remembered pointer position no longer means anything */
  reset(): void {
    this.pointer = null;
    this.clear();
  }

  destroy(): void {
    this.cancel();
    this.listeners.abort();
  }

  /** Throttle: an already-pending test picks up the latest pointer */
  private schedule(): void {
    if (this.handle !== null || !this.pointer) return;
    this.handle = window.setTimeout(() => {
      this.handle = null;
      this.hitTest();
    }, HOVER_INTERVAL_MS);
  }

  /** Interactions (drag, leave, new data) drop the hover instantly */
  private clear(): void {
    this.cancel();
    if (this.shown) {
      this.shown = null;
      this.callbacks.onHover(null);
    }
  }

  private cancel(): void {
    if (this.handle !== null) {
      window.clearTimeout(this.handle);
      this.handle = null;
    }
  }

  private hitTest(): void {
    if (!this.pointer || this.callbacks.isBlocked()) return;
    const hit = this.callbacks.pick(this.pointer[0], this.pointer[1]);
    if (!hit) {
      if (this.shown) {
        this.shown = null;
        this.callbacks.onHover(null);
      }
      return;
    }
    // Same point at the same projected spot: nothing changed for the
    // host, so stay silent (a re-fire would remount the hover card).
    // A moved camera changes x/y, which must re-fire to re-anchor.
    if (
      this.shown &&
      this.shown.index === hit.index &&
      this.shown.x === hit.x &&
      this.shown.y === hit.y
    ) {
      return;
    }
    this.shown = hit;
    this.callbacks.onHover(hit);
  }
}
