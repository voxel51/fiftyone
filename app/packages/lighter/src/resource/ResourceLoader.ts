/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Interface for loading resources with retry logic.
 */
export interface ResourceLoader {
  /**
   * Loads a resource from a URL.
   * @param url - The URL to load from.
   * @param retries - Number of retry attempts (default: 3).
   * @returns Promise that resolves to the loaded resource.
   */
  load<T>(url: string, retries?: number): Promise<T>;
}
