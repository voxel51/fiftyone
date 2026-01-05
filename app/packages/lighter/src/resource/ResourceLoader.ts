/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Options for loading resources.
 */
export interface LoadOptions {
  /**
   * Number of retry attempts (default: 3).
   */
  retries?: number;
  /**
   * Hint about the type of asset being loaded.
   * This helps the loader choose the most appropriate loading strategy.
   */
  hint?: "texture" | "video" | "json" | "font" | "text" | "spritesheet";
}

/**
 * Interface for loading resources with retry logic.
 */
export interface ResourceLoader {
  /**
   * Loads a resource from a URL.
   * @param url - The URL to load from.
   * @param options - Loading options including retry attempts and asset type hint.
   * @returns Promise that resolves to the loaded resource.
   */
  load<T>(url: string, options?: LoadOptions): Promise<T>;

  /**
   * Loads a resource in the background without blocking the main thread.
   * This is useful for preloading assets that will be needed later.
   * @param url - The URL to load from.
   * @param options - Loading options including retry attempts and asset type hint.
   * @returns Promise that resolves when the background loading is complete.
   */
  loadBackground<T>(url: string, options?: LoadOptions): Promise<T>;
}
