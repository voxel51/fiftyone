/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { ResourceLoader } from "./ResourceLoader";

/**
 * PixiJS resource loader implementation.
 * This is a stub implementation - actual implementation would use PixiJS resource loading.
 */
export class PixiResourceLoader implements ResourceLoader {
  async load<T>(url: string, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        // In actual implementation:
        // return await PIXI.Assets.load<T>(url);

        // For now, simulate loading with a delay
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Simulate successful loading
        return {} as T;
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }

    throw new Error(
      `Failed to load resource after ${retries} attempts: ${url}`
    );
  }
}
