/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { LoadOptions, ResourceLoader } from "./ResourceLoader";

/**
 * Mock implementation of ResourceLoader for lightweight testing and development.
 * This mock provides no-op implementations of all resource loading methods,
 * making it suitable for creating lightweight lighter scenes without actual resource loading.
 */
export class MockResourceLoader implements ResourceLoader {
  private loadedResources = new Map<string, any>();
  private backgroundLoadedResources = new Map<string, any>();

  /**
   * Mock implementation of resource loading.
   * Returns an empty object for any URL without actually loading resources.
   *
   * @param url - The URL to load from (ignored in mock)
   * @param options - Loading options (ignored in mock)
   * @returns Promise that resolves to an empty object
   */
  async load<T>(url: string, options?: LoadOptions): Promise<T> {
    // Store the "loaded" resource for potential retrieval
    const mockResource = {} as T;
    this.loadedResources.set(url, mockResource);

    // Simulate async loading with a small delay
    // In a real implementation, options would be used for retry logic, etc.
    const delay = options?.retries ? options.retries * 10 : 0;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return mockResource;
  }

  /**
   * Mock implementation of background resource loading.
   * Returns an empty object for any URL without actually loading resources.
   *
   * @param url - The URL to load from (ignored in mock)
   * @param options - Loading options (ignored in mock)
   * @returns Promise that resolves to an empty object
   */
  async loadBackground<T>(url: string, options?: LoadOptions): Promise<T> {
    // Store the "loaded" resource for potential retrieval
    const mockResource = {} as T;
    this.backgroundLoadedResources.set(url, mockResource);

    // Simulate async loading with a small delay
    // In a real implementation, options would be used for retry logic, etc.
    const delay = options?.retries ? options.retries * 5 : 0;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return mockResource;
  }

  /**
   * Mock-specific method to get a previously "loaded" resource.
   *
   * @param url - The URL of the resource to retrieve
   * @returns The mock resource or undefined if not found
   */
  getLoadedResource<T>(url: string): T | undefined {
    return this.loadedResources.get(url) as T;
  }

  /**
   * Mock-specific method to get a previously background-loaded resource.
   *
   * @param url - The URL of the resource to retrieve
   * @returns The mock resource or undefined if not found
   */
  getBackgroundLoadedResource<T>(url: string): T | undefined {
    return this.backgroundLoadedResources.get(url) as T;
  }

  /**
   * Mock-specific method to check if a resource has been "loaded".
   *
   * @param url - The URL to check
   * @returns True if the resource has been loaded
   */
  hasLoadedResource(url: string): boolean {
    return this.loadedResources.has(url);
  }

  /**
   * Mock-specific method to check if a resource has been background-loaded.
   *
   * @param url - The URL to check
   * @returns True if the resource has been background-loaded
   */
  hasBackgroundLoadedResource(url: string): boolean {
    return this.backgroundLoadedResources.has(url);
  }

  /**
   * Mock-specific method to get all loaded resource URLs.
   *
   * @returns Array of all loaded resource URLs
   */
  getLoadedResourceUrls(): string[] {
    return Array.from(this.loadedResources.keys());
  }

  /**
   * Mock-specific method to get all background-loaded resource URLs.
   *
   * @returns Array of all background-loaded resource URLs
   */
  getBackgroundLoadedResourceUrls(): string[] {
    return Array.from(this.backgroundLoadedResources.keys());
  }

  /**
   * Mock-specific method to clear all loaded resources.
   */
  clearLoadedResources(): void {
    this.loadedResources.clear();
  }

  /**
   * Mock-specific method to clear all background-loaded resources.
   */
  clearBackgroundLoadedResources(): void {
    this.backgroundLoadedResources.clear();
  }

  /**
   * Mock-specific method to clear all resources.
   */
  clearAllResources(): void {
    this.clearLoadedResources();
    this.clearBackgroundLoadedResources();
  }

  /**
   * Mock-specific method to get the total number of loaded resources.
   *
   * @returns Total count of loaded resources
   */
  getLoadedResourceCount(): number {
    return this.loadedResources.size;
  }

  /**
   * Mock-specific method to get the total number of background-loaded resources.
   *
   * @returns Total count of background-loaded resources
   */
  getBackgroundLoadedResourceCount(): number {
    return this.backgroundLoadedResources.size;
  }
}
