import { OrthographicCamera } from "three";
import { MARGIN, MAX_ZOOM, PAN_GIVE } from "../constants";
import {
  clampToHome,
  fitRect,
  panRect,
  pxToData,
  zoomOf,
  zoomRect,
  type Rect,
} from "../math";
import type { Bounds, CameraAdapter, InteractionMode, Polygon } from "../types";

/**
 * 2D camera: an orthographic frustum window over the data, driven by our
 * own pointer/wheel handling (no d3). Interactions match the FiftyOne
 * embeddings panel conventions: wheel zooms toward the cursor,
 * shift-drag or middle-drag pans, plain drag is left to the lasso.
 * No smoothing or easing anywhere — renders track input exactly.
 */
export class PlanarCamera implements CameraAdapter {
  readonly camera: OrthographicCamera;

  private readonly element: HTMLElement;
  private readonly onChange: () => void;
  private readonly listeners = new AbortController();

  private bounds: Bounds | null = null;
  private focus: Bounds | null = null;
  private home: Rect = { x0: -1, y0: -1, x1: 1, y1: 1 };
  private rect: Rect = this.home;
  private width = 1;
  private height = 1;
  private panPointer: number | null = null;
  private panLast: [number, number] = [0, 0];
  // The chart owns the resting cursor; a drag only borrows it
  private cursorBefore = "";
  private mode: InteractionMode = "select";

  constructor(element: HTMLElement, onChange: () => void) {
    this.element = element;
    this.onChange = onChange;
    // Frustum in data units; the data plane sits at z=0, camera at z=1
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.set(0, 0, 1);

    const { signal } = this.listeners;
    // Non-passive: without preventDefault, trackpad pinches page-zoom
    // the browser instead of the chart
    element.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
      signal,
    });
    element.addEventListener("pointerdown", (e) => this.handlePanStart(e), {
      signal,
    });
    element.addEventListener("pointermove", (e) => this.handlePanMove(e), {
      signal,
    });
    for (const type of ["pointerup", "pointercancel"] as const) {
      element.addEventListener(type, (e) => this.handlePanEnd(e), { signal });
    }
  }

  /**
   * In select mode a plain left-drag draws the lasso and pans need
   * shift or middle button; in explore mode the camera owns plain drags
   * and no gesture lassos.
   */
  isLassoStart(event: PointerEvent): boolean {
    return this.mode === "select" && event.button === 0 && !event.shiftKey;
  }

  setMode(mode: InteractionMode): void {
    this.mode = mode;
  }

  /** Orthographic window: screen -> data is exact rectangle algebra */
  toDataPolygon(polygon: Polygon): Array<[number, number]> {
    return polygon.map(([x, y]) =>
      pxToData(this.rect, this.width, this.height, x, y),
    );
  }

  setBounds(bounds: Bounds, width: number, height: number): void {
    this.bounds = bounds;
    this.focus = null;
    this.width = width;
    this.height = height;
    this.home = fitRect(bounds, width, height, MARGIN);
    this.rect = this.home;
    this.apply();
  }

  /** No immediate view change — the focus only steers the next reset() */
  setFocus(bounds: Bounds | null): void {
    this.focus = bounds;
  }

  /** Keep the current zoom + center; re-fit the home rect to the new size */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.bounds) return;
    const k = zoomOf(this.rect, this.home);
    const cx = (this.rect.x0 + this.rect.x1) / 2;
    const cy = (this.rect.y0 + this.rect.y1) / 2;
    this.home = fitRect(this.bounds, width, height, MARGIN);
    const w = (this.home.x1 - this.home.x0) / k;
    const h = (this.home.y1 - this.home.y0) / k;
    this.rect = clampToHome(
      { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 },
      this.home,
    );
    this.apply();
  }

  reset(): void {
    this.rect = this.focus ? this.frameFocus(this.focus) : this.home;
    this.apply();
  }

  /**
   * Fit the focus region like a home rect, but capped at the
   * interactive zoom limit (a tiny cluster must not out-zoom what the
   * wheel allows) and clamped to the pannable area, so a reset never
   * lands somewhere the user couldn't reach by hand.
   */
  private frameFocus(focus: Bounds): Rect {
    const fitted = fitRect(focus, this.width, this.height, MARGIN);
    const k = Math.min(zoomOf(fitted, this.home), MAX_ZOOM);
    const w = (this.home.x1 - this.home.x0) / k;
    const h = (this.home.y1 - this.home.y0) / k;
    const cx = (focus.xMin + focus.xMax) / 2;
    const cy = (focus.yMin + focus.yMax) / 2;
    return clampToHome(
      { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 },
      this.home,
    );
  }

  destroy(): void {
    this.listeners.abort();
  }

  /** Push the rect into the camera frustum and notify */
  private apply(): void {
    const { x0, y0, x1, y1 } = this.rect;
    this.camera.left = x0;
    this.camera.right = x1;
    this.camera.top = y1;
    this.camera.bottom = y0;
    this.camera.updateProjectionMatrix();
    this.onChange();
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    // Exponential zoom per wheel tick; pinch gestures arrive as
    // ctrl+wheel with small deltas, so they get a stronger factor
    const speed = event.ctrlKey ? 0.02 : 0.002;
    const factor = Math.pow(2, -event.deltaY * speed);
    const focus = pxToData(
      this.rect,
      this.width,
      this.height,
      event.offsetX,
      event.offsetY,
    );
    this.rect = zoomRect(
      this.rect,
      this.home,
      focus,
      factor,
      MAX_ZOOM,
      PAN_GIVE,
    );
    this.apply();
  }

  private handlePanStart(event: PointerEvent): void {
    // One pan at a time: a second pointer would overwrite the borrowed
    // cursor and orphan the first pointer's restore
    if (this.panPointer !== null) return;
    const pan =
      event.button === 1 ||
      (event.button === 0 && (event.shiftKey || this.mode === "explore"));
    if (!pan) return;
    event.preventDefault();
    this.panPointer = event.pointerId;
    this.panLast = [event.offsetX, event.offsetY];
    this.cursorBefore = this.element.style.cursor;
    this.element.style.cursor = "grabbing";
    this.element.setPointerCapture(event.pointerId);
  }

  private handlePanMove(event: PointerEvent): void {
    if (this.panPointer !== event.pointerId) return;
    const [lastX, lastY] = this.panLast;
    this.panLast = [event.offsetX, event.offsetY];
    // Content follows the cursor: the window moves opposite the drag
    // (screen y points down, data y points up — hence the sign split)
    const perPxX = (this.rect.x1 - this.rect.x0) / this.width;
    const perPxY = (this.rect.y1 - this.rect.y0) / this.height;
    this.rect = panRect(
      this.rect,
      this.home,
      -(event.offsetX - lastX) * perPxX,
      (event.offsetY - lastY) * perPxY,
      PAN_GIVE,
    );
    this.apply();
  }

  private handlePanEnd(event: PointerEvent): void {
    if (this.panPointer !== event.pointerId) return;
    this.panPointer = null;
    this.element.style.cursor = this.cursorBefore;
  }
}
