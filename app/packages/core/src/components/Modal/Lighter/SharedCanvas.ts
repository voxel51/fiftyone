/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Singleton canvas manager that creates and maintains a persistent canvas element.
 * This, together with the SharedPixiApplication, allows us to keep the WebGL context alive and to a single instance.
 */
class SingletonCanvas {
  private static instance: SingletonCanvas | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private container: HTMLElement | null = null;
  private isAttached = false;

  private constructor() {}

  static getInstance(): SingletonCanvas {
    if (!SingletonCanvas.instance) {
      SingletonCanvas.instance = new SingletonCanvas();
    }
    return SingletonCanvas.instance;
  }

  /**
   * Get or create the singleton canvas element.
   * If a container is provided, the canvas will be attached to it.
   */
  getCanvas(container?: HTMLElement): HTMLCanvasElement {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.id = "lighter-singleton-canvas";
      this.canvas.setAttribute("data-cy", "lighter-sample-renderer-canvas");
      this.canvas.style.display = "block";
      this.canvas.style.flex = "1";
    }

    if (container && (!this.isAttached || this.container !== container)) {
      // Detach from previous container if any
      if (this.container && this.canvas.parentNode === this.container) {
        this.container.removeChild(this.canvas);
      }

      container.appendChild(this.canvas);
      this.container = container;
      this.isAttached = true;
    }

    return this.canvas;
  }

  /**
   * Detach the canvas from its current container.
   * The canvas element itself is preserved for reuse.
   */
  detach(): void {
    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
      this.isAttached = false;
      this.container = null;
    }
  }

  /**
   * Get the current canvas element without attaching to a container.
   */
  getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /**
   * Check if the canvas is currently attached to a container.
   */
  isCanvasAttached(): boolean {
    return this.isAttached && this.canvas !== null;
  }

  /**
   * Destroy the singleton canvas and clean up resources.
   * Realistically, it's fine for this to never be called. See SharedPixiApplication.destroy().
   */
  destroy(): void {
    this.detach();
    if (this.canvas) {
      this.canvas = null;
    }
    this.container = null;
    this.isAttached = false;
  }
}

export const singletonCanvas = SingletonCanvas.getInstance();
