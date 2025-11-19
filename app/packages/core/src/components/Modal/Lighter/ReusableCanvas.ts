/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * A reusable canvas manager that creates and maintains a persistent canvas
 * element.
 *
 * A ReusableCanvas and a SharedPixiApplication allows a single WebGL context
 * to be maintained across Lighter scenes.
 */
class ReusabledCanvas {
  private canvas: HTMLCanvasElement;

  constructor(id = "default") {
    this.canvas = document.createElement("canvas");
    this.canvas.id = `lighter-canvas-${id}`;
    this.canvas.setAttribute("data-cy", `lighter-sample-renderer-canvas-${id}`);
    this.canvas.style.display = "block";
    this.canvas.style.flex = "1";
  }

  /**
   * Get the canvas
   *
   * If a container is provided, the canvas will be attached to it.
   */
  getCanvas(container: null | HTMLElement) {
    if (!container || container === this.canvas.parentNode) {
      return this.canvas;
    }

    this.canvas.remove();
    container.appendChild(this.canvas);

    return this.canvas;
  }

  /**
   * Detach the canvas from its current container.
   * The canvas element itself is preserved for reuse.
   */
  detach() {
    if (this.isCanvasAttached()) {
      this.canvas.remove();
    }
  }

  /**
   * Get the current canvas element without attaching to a container.
   */
  getCanvasElement() {
    return this.canvas;
  }

  /**
   * Check if the canvas is currently attached to a container.
   */
  isCanvasAttached() {
    return !!this.canvas.parentNode;
  }
}

export default ReusabledCanvas;

export const defaultCanvas = new ReusabledCanvas();
