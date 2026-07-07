import { HOVER_DEBOUNCE_MS } from "../constants";
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
 * Debounced hover: any movement hides the current hit immediately; the
 * hit-test runs only after the pointer sits still for HOVER_DEBOUNCE_MS.
 * Camera drags never trigger it (buttons are tracked in capture phase so
 * this stays true even when other handlers stopPropagation), and camera
 * changes without pointer movement — wheel zooms — re-test after
 * settling via viewChanged().
 */
export class HoverPicker {
  private readonly callbacks: HoverCallbacks;
  private readonly listeners = new AbortController();
  private handle: number | null = null;
  /** Last idle pointer position (CSS px); null once the pointer leaves */
  private pointer: [number, number] | null = null;
  private hitShown = false;
  private buttonsDown = false;

  constructor(container: HTMLElement, callbacks: HoverCallbacks) {
    this.callbacks = callbacks;
    const { signal } = this.listeners;
    container.addEventListener(
      "pointerdown",
      () => {
        this.buttonsDown = true;
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

  /** Hide any current hit now, hit-test once the pointer settles */
  private schedule(): void {
    this.clear();
    if (!this.pointer) return;
    this.handle = window.setTimeout(() => {
      this.handle = null;
      this.hitTest();
    }, HOVER_DEBOUNCE_MS);
  }

  private clear(): void {
    this.cancel();
    if (this.hitShown) {
      this.hitShown = false;
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
    if (!hit) return;
    this.hitShown = true;
    this.callbacks.onHover(hit);
  }
}
