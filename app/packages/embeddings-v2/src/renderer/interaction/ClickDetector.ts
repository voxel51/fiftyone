import { CLICK_SLOP_PX } from "../constants";

interface ClickCallbacks {
  /** A plain left click (no modifier, no drag) at container CSS px */
  onClick: (x: number, y: number) => void;
}

/**
 * Plain-click detection for gestures the lasso doesn't own. With the
 * planar camera the lasso claims plain left pointer-downs in the
 * capture phase (with stopPropagation), so these bubble-phase listeners
 * never fire there — short lasso gestures report clicks through
 * LassoOverlay's onComplete instead. Camera adapters that keep plain
 * drags for camera movement let those events bubble, so this detector
 * supplies their click path: a press+release within CLICK_SLOP_PX that
 * no other interaction consumed.
 */
export class ClickDetector {
  private readonly listeners = new AbortController();
  private pointerId: number | null = null;
  private downX = 0;
  private downY = 0;

  constructor(container: HTMLElement, callbacks: ClickCallbacks) {
    const { signal } = this.listeners;
    container.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || event.shiftKey) return;
        this.pointerId = event.pointerId;
        this.downX = event.offsetX;
        this.downY = event.offsetY;
      },
      { signal },
    );
    container.addEventListener(
      "pointerup",
      (event) => {
        if (this.pointerId !== event.pointerId) return;
        this.pointerId = null;
        const dx = event.offsetX - this.downX;
        const dy = event.offsetY - this.downY;
        if (dx * dx + dy * dy > CLICK_SLOP_PX * CLICK_SLOP_PX) return;
        callbacks.onClick(event.offsetX, event.offsetY);
      },
      { signal },
    );
    container.addEventListener(
      "pointercancel",
      () => {
        this.pointerId = null;
      },
      { signal },
    );
  }

  destroy(): void {
    this.listeners.abort();
  }
}
