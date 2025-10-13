/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import * as PIXI from "pixi.js";
import { TextureStyle } from "pixi.js";

// Set global default for pixelated rendering ("nearest")
// instead of smoothed out ("linear")
// This must be set before any textures are created
TextureStyle.defaultOptions.scaleMode = "nearest";

/**
 * Singleton PIXI Application that can be shared across multiple renderers.
 * This reduces memory usage and keeps WebGL context alive and to a single instance.
 */
class SharedPixiApplication {
  private static instance: SharedPixiApplication | null = null;
  private app: PIXI.Application | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): SharedPixiApplication {
    if (!SharedPixiApplication.instance) {
      SharedPixiApplication.instance = new SharedPixiApplication();
    }
    return SharedPixiApplication.instance;
  }

  /**
   * Initialize the shared PIXI application if not already done.
   * Returns the application instance.
   */
  async initialize(canvas: HTMLCanvasElement): Promise<PIXI.Application> {
    if (this.isInitialized && this.app) {
      return this.app;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.app!;
    }

    this.initPromise = this.performInitialization(canvas);
    await this.initPromise;
    return this.app!;
  }

  /**
   * Performs the actual PIXI application initialization.
   */
  private async performInitialization(
    canvas: HTMLCanvasElement
  ): Promise<void> {
    this.app = new PIXI.Application();

    await this.app.init({
      canvas,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundAlpha: 0,
      autoStart: false,
      // note: webgpu is faster but not consistent across browsers and has random bugs
      preference: "webgl",
    });

    this.isInitialized = true;
  }

  /**
   * Get the shared PIXI application instance.
   */
  getApplication(): PIXI.Application | null {
    return this.app;
  }

  /**
   * Check if the application is initialized.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Destroy the shared application and clean up resources.
   * Realistically, it's fine for this to never be called.
   */
  destroy(): void {
    if (this.app) {
      this.app.destroy();
      this.app = null;
      this.isInitialized = false;
      this.initPromise = null;
    }
  }
}

export const sharedPixiApp = SharedPixiApplication.getInstance();
