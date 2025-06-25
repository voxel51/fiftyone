/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Overlay, OverlayType, OverlayOptions } from "../types";
import {
  BoundingBoxOverlay,
  type BoundingBoxOverlayOptions,
} from "../overlays/bounding-box";
import {
  ClassificationOverlay,
  type ClassificationOverlayOptions,
} from "../overlays/classification";

/**
 * Factory function type for creating overlays.
 */
export type OverlayFactory<T extends OverlayOptions = OverlayOptions> = (
  options: T
) => Overlay;

/**
 * Registry for overlay factory functions.
 */
export class OverlayFactoryRegistry {
  private factories = new Map<OverlayType, OverlayFactory>();

  constructor() {
    // Register built-in overlay types
    this.registerFactory(
      "bounding-box",
      (options: BoundingBoxOverlayOptions) => new BoundingBoxOverlay(options)
    );

    this.registerFactory(
      "classification",
      (options: ClassificationOverlayOptions) =>
        new ClassificationOverlay(options)
    );
  }

  /**
   * Registers a new overlay factory.
   */
  registerFactory<T extends OverlayOptions>(
    type: OverlayType,
    factory: OverlayFactory<T>
  ): void {
    if (this.factories.has(type)) {
      console.warn(
        `Overlay factory for type '${type}' already exists. Overriding.`
      );
    }
    this.factories.set(type, factory as OverlayFactory);
  }

  /**
   * Unregisters an overlay factory.
   */
  unregisterFactory(type: OverlayType): boolean {
    return this.factories.delete(type);
  }

  /**
   * Creates an overlay instance of the specified type.
   */
  createOverlay<T extends OverlayOptions>(
    type: OverlayType,
    options: T
  ): Overlay {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`No factory registered for overlay type: ${type}`);
    }

    try {
      return factory(options);
    } catch (error) {
      throw new Error(
        `Failed to create overlay of type '${type}': ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Gets all registered overlay types.
   */
  getRegisteredTypes(): OverlayType[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Checks if a factory is registered for the given type.
   */
  hasFactory(type: OverlayType): boolean {
    return this.factories.has(type);
  }

  /**
   * Creates a new registry instance with the same factories.
   */
  clone(): OverlayFactoryRegistry {
    const newRegistry = new OverlayFactoryRegistry();
    newRegistry.factories.clear(); // Clear built-ins first

    // Copy all factories
    for (const [type, factory] of this.factories) {
      newRegistry.factories.set(type, factory);
    }

    return newRegistry;
  }

  /**
   * Clears all registered factories.
   */
  clear(): void {
    this.factories.clear();
  }
}

/**
 * Default global overlay factory registry.
 */
export const overlayFactoryRegistry = new OverlayFactoryRegistry();

/**
 * Convenience function to create an overlay using the global registry.
 */
export function createOverlay<T extends OverlayOptions>(
  type: OverlayType,
  options: T
): Overlay {
  return overlayFactoryRegistry.createOverlay(type, options);
}

/**
 * Convenience function to register a factory in the global registry.
 */
export function registerOverlayFactory<T extends OverlayOptions>(
  type: OverlayType,
  factory: OverlayFactory<T>
): void {
  overlayFactoryRegistry.registerFactory(type, factory);
}
