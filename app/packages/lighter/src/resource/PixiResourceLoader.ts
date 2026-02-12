/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as PIXI from "pixi.js";
import { Assets } from "pixi.js";
import type { LoadOptions, ResourceLoader } from "./ResourceLoader";

// todo: make this more robust and idiomatic
PIXI.loadTextures.test = (_url, resolvedAsset) => {
  resolvedAsset!.loadParser = "loadTextures";
  // always return true for now
  return true;
};

/**
 *
 * PixiJS resource loader implementation using the native Assets manager.
 * Provides caching, retry logic, and support for various asset types.
 */
export class PixiResourceLoader implements ResourceLoader {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the Assets manager if not already done.
   * This should be called before loading any assets.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      // If initialization is already in progress, wait for it
      await this.initPromise;
      return;
    }

    // Start initialization and store the promise
    this.initPromise = this.performInitialization();

    try {
      await this.initPromise;
      this.initialized = true;
    } catch (error) {
      // Clear the promise on failure so retries can attempt again
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Performs the actual Assets.init call
   */
  private async performInitialization(): Promise<void> {
    // Safe fallback for SSR environments
    const resolution =
      typeof window !== "undefined" && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1;

    await Assets.init({
      preferences: {
        // Note: having these on will incur a `fetch` request
        // that requires a CORS preflight request.
        // Keep these off.
        preferCreateImageBitmap: false,
        preferWorkers: false,
      },
      texturePreference: {
        resolution,
        format: ["avif", "webp", "jpg", "jpeg", "png"],
      },
    });
  }

  /**
   * Loads a resource from a URL using PixiJS Assets manager.
   * Supports various file types including images, videos, fonts, JSON, etc.
   *
   * @param url - The URL to load from.
   * @param options - Loading options including retry attempts and asset type hint.
   * @returns Promise that resolves to the loaded resource.
   */
  async load<T>(url: string, options?: LoadOptions): Promise<T> {
    await this.ensureInitialized();

    const retries = options?.retries ?? 3;

    for (let i = 0; i < retries; i++) {
      try {
        const loaded = await Assets.load<T>(url);
        return loaded;
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        // Wait before retrying with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i))
        );
      }
    }

    throw new Error(
      `Failed to load resource after ${retries} attempts: ${url}`
    );
  }

  /**
   * Loads a resource in the background without blocking the main thread.
   * Uses PixiJS Assets.backgroundLoad() for non-blocking asset loading.
   *
   * @param url - The URL to load from.
   * @param options - Loading options including retry attempts and asset type hint.
   * @returns Promise that resolves to the loaded resource.
   */
  async loadBackground<T>(url: string, options?: LoadOptions): Promise<T> {
    await this.ensureInitialized();

    const retries = options?.retries ?? 3;

    for (let i = 0; i < retries; i++) {
      try {
        // Use PixiJS Assets.backgroundLoad for non-blocking loading
        await Assets.backgroundLoad([url]);

        // Wait for the asset to be available in cache
        let attempts = 0;
        const maxAttempts = 10; // Prevent infinite loop
        while (attempts < maxAttempts) {
          const asset = Assets.get<T>(url);
          if (asset) {
            return asset;
          }
          await new Promise((resolve) => setTimeout(resolve, 50)); // Check every 50ms
          attempts++;
        }

        throw new Error(
          `Asset not available in cache after background loading: ${url}`
        );
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        // Wait before retrying with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i))
        );
      }
    }

    throw new Error(
      `Failed to load resource in background after ${retries} attempts: ${url}`
    );
  }

  /**
   * Loads a resource using the appropriate loader based on the hint.
   * @param url - The URL to load from.
   * @param hint - The asset type hint.
   * @returns Promise that resolves to the loaded resource.
   */
  private async loadWithHint<T>(
    url: string,
    hint: LoadOptions["hint"]
  ): Promise<T> {
    if (hint === "texture") {
      // return await loadTextures(url, {
      //   texturePreference: {
      //     resolution: window.devicePixelRatio,
      //     format: ["avif", "webp", "jpg", "jpeg", "png"],
      //   },
      // });
    }

    return await Assets.load<T>(url);
  }

  /**
   * Get a previously loaded asset from cache.
   * @param url - The URL of the asset.
   * @returns The cached asset or undefined if not found.
   */
  get<T>(url: string): T | undefined {
    return Assets.get<T>(url);
  }

  /**
   * Unload an asset from cache to free memory.
   * @param url - The URL of the asset to unload.
   */
  async unload(url: string): Promise<void> {
    await Assets.unload(url);
  }

  /**
   * Load multiple assets at once.
   * @param urls - Array of URLs to load.
   * @param options - Loading options including retry attempts and asset type hint.
   * @returns Promise that resolves to an object mapping URLs to loaded resources.
   */
  async loadMultiple<T>(
    urls: string[],
    options?: LoadOptions
  ): Promise<Record<string, T>> {
    await this.ensureInitialized();

    const retries = options?.retries ?? 3;

    for (let i = 0; i < retries; i++) {
      try {
        // Use hint to delegate to appropriate loader if provided
        if (options?.hint) {
          return await this.loadMultipleWithHint<T>(urls, options.hint);
        }

        // Use PixiJS Assets.load for multiple assets
        return await Assets.load<T>(urls);
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        // Wait before retrying with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i))
        );
      }
    }

    throw new Error(
      `Failed to load resources after ${retries} attempts: ${urls.join(", ")}`
    );
  }

  /**
   * Loads multiple resources using the appropriate loader based on the hint.
   * @param urls - Array of URLs to load.
   * @param hint - The asset type hint.
   * @returns Promise that resolves to an object mapping URLs to loaded resources.
   */
  private async loadMultipleWithHint<T>(
    urls: string[],
    hint: LoadOptions["hint"]
  ): Promise<Record<string, T>> {
    // For now, use the generic Assets.load which auto-detects based on file extension
    // The hint parameter is available for future extensibility when we need type-specific loading
    return await Assets.load<T>(urls);
  }
}
