import { LASSO_COLOR } from "../constants";
import type { Polygon } from "../types";

interface LassoCallbacks {
  /** Which pointer-downs begin a lasso (the camera adapter decides) */
  shouldStart: (event: PointerEvent) => boolean;
  /**
   * Fired once per completed gesture. A real lasso passes its polygon; a
   * gesture too short to enclose anything (a click) passes null with the
   * release position, so the chart can treat it as a point click.
   */
  onComplete: (screenPolygon: Polygon | null, x: number, y: number) => void;
}

/**
 * Freehand lasso: captures the polygon with capture-phase pointer
 * listeners (so a drawing drag never reaches the camera's handlers) and
 * draws it on a pointer-transparent SVG overlay above the canvas.
 */
export class LassoOverlay {
  private readonly svg: SVGSVGElement;
  private readonly path: SVGPathElement;
  private readonly listeners = new AbortController();
  private polygon: Polygon = [];
  private drawing = false;
  private pointerId: number | null = null;

  constructor(container: HTMLElement, callbacks: LassoCallbacks) {
    const ns = "http://www.w3.org/2000/svg";
    this.svg = document.createElementNS(ns, "svg");
    Object.assign(this.svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      // Purely visual; all pointer events belong to the canvas below
      pointerEvents: "none",
      // Must sit above the canvas regardless of DOM order
      zIndex: "1",
    });
    this.path = document.createElementNS(ns, "path");
    this.path.setAttribute("fill", LASSO_COLOR);
    this.path.setAttribute("fill-opacity", "0.08");
    this.path.setAttribute("stroke", LASSO_COLOR);
    this.path.setAttribute("stroke-width", "1.5");
    this.svg.appendChild(this.path);
    container.appendChild(this.svg);

    // Capture phase: while drawing, stopPropagation keeps the events
    // away from the camera adapter's own drag handlers
    const { signal } = this.listeners;
    container.addEventListener(
      "pointerdown",
      (event) => {
        if (this.drawing || !callbacks.shouldStart(event)) return;
        event.stopPropagation();
        event.preventDefault();
        this.drawing = true;
        this.pointerId = event.pointerId;
        this.polygon = [[event.offsetX, event.offsetY]];
        container.setPointerCapture(event.pointerId);
      },
      { capture: true, signal },
    );
    container.addEventListener(
      "pointermove",
      (event) => {
        if (!this.drawing || event.pointerId !== this.pointerId) return;
        event.stopPropagation();
        const [lastX, lastY] = this.polygon[this.polygon.length - 1];
        const dx = event.offsetX - lastX;
        const dy = event.offsetY - lastY;
        // Skip sub-3px moves: keeps the polygon small for hit-testing
        if (dx * dx + dy * dy < 9) return;
        this.polygon.push([event.offsetX, event.offsetY]);
        this.path.setAttribute(
          "d",
          `M${this.polygon.map((p) => p.join(",")).join("L")}Z`,
        );
      },
      { capture: true, signal },
    );
    container.addEventListener(
      "pointerup",
      (event) => {
        if (!this.drawing || event.pointerId !== this.pointerId) return;
        event.stopPropagation();
        this.drawing = false;
        this.pointerId = null;
        const polygon = this.polygon;
        this.polygon = [];
        this.path.setAttribute("d", "");
        callbacks.onComplete(
          polygon.length >= 3 ? polygon : null,
          event.offsetX,
          event.offsetY,
        );
      },
      { capture: true, signal },
    );
    // A cancelled gesture (touch scroll takeover, capture loss) is
    // neither a lasso nor a click: abandon silently or `drawing` leaks
    // and suppresses hover forever
    container.addEventListener(
      "pointercancel",
      (event) => {
        if (!this.drawing || event.pointerId !== this.pointerId) return;
        this.drawing = false;
        this.pointerId = null;
        this.polygon = [];
        this.path.setAttribute("d", "");
      },
      { capture: true, signal },
    );
  }

  /** True while a lasso drag is in progress (suppresses hover) */
  isDrawing(): boolean {
    return this.drawing;
  }

  destroy(): void {
    this.listeners.abort();
    this.svg.remove();
  }
}
