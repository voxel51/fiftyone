/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Resource, LoadedResource } from "../types";

/**
 * Resource loader interface.
 */
export interface ResourceLoader {
  load(resource: Resource): Promise<LoadedResource>;
}

/**
 * Default resource loader implementation with retry logic.
 */
export class DefaultResourceLoader implements ResourceLoader {
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(maxRetries = 2, retryDelay = 1000) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  async load(resource: Resource): Promise<LoadedResource> {
    let lastError: Error | null = null;
    const retryCount = resource.retryCount ?? 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const data = await this.loadResource(resource);
        return {
          data,
          url: resource.url,
          type: resource.type,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * (attempt + 1));
        }
      }
    }

    throw new Error(
      `Failed to load resource ${resource.url} after ${
        this.maxRetries + 1
      } attempts: ${lastError?.message}`
    );
  }

  private async loadResource(resource: Resource): Promise<any> {
    const response = await fetch(resource.url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    switch (resource.type) {
      case "image":
        return this.loadImage(resource.url);

      case "json":
        return response.json();

      case "binary":
        return response.arrayBuffer();

      default:
        return response.text();
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

      // Enable CORS if needed
      img.crossOrigin = "anonymous";
      img.src = url;
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Mock resource loader for testing.
 */
export class MockResourceLoader implements ResourceLoader {
  private resources = new Map<string, any>();
  private failures = new Set<string>();

  addResource(url: string, data: any): void {
    this.resources.set(url, data);
  }

  addFailure(url: string): void {
    this.failures.add(url);
  }

  async load(resource: Resource): Promise<LoadedResource> {
    if (this.failures.has(resource.url)) {
      throw new Error(`Mock failure for ${resource.url}`);
    }

    const data = this.resources.get(resource.url);
    if (data === undefined) {
      throw new Error(`Resource not found: ${resource.url}`);
    }

    return {
      data,
      url: resource.url,
      type: resource.type,
    };
  }

  clear(): void {
    this.resources.clear();
    this.failures.clear();
  }
}
