/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { BaseOverlay } from "./BaseOverlay";
import { BoundingBoxOverlay } from "./BoundingBoxOverlay";
import { ClassificationOverlay } from "./ClassificationOverlay";
import { ImageOverlay } from "./ImageOverlay";

/**
 * Constructor type for overlays.
 */
export type OverlayConstructor<T = any> = (opts: T) => BaseOverlay;

/**
 * Factory for creating overlays.
 */
export class OverlayFactory {
  private registry = new Map<string, OverlayConstructor>();

  /**
   * Creates a factory instance with built-in overlays pre-registered.
   * @returns A factory instance with all built-in overlays registered.
   */
  static createWithBuiltIns(): OverlayFactory {
    const factory = new OverlayFactory();

    // Register built-in overlays
    factory.register("bounding-box", (opts) => new BoundingBoxOverlay(opts));
    factory.register(
      "classification",
      (opts) => new ClassificationOverlay(opts)
    );
    factory.register("image", (opts) => new ImageOverlay(opts));

    return factory;
  }

  /**
   * Registers an overlay type with its constructor.
   * @param type - The overlay type identifier.
   * @param constructor - The constructor function.
   */
  register<T = any>(type: string, constructor: OverlayConstructor<T>): void {
    this.registry.set(type, constructor);
  }

  /**
   * Creates an overlay of the specified type with type safety for built-in overlays.
   * @param type - The overlay type to create.
   * @param opts - Options to pass to the constructor.
   * @returns The created overlay.
   * @throws Error if the overlay type is not registered.
   */
  create<T = any>(type: string, opts: T): BaseOverlay {
    const constructor = this.registry.get(type);
    if (!constructor) {
      throw new Error(`Overlay type '${type}' is not registered`);
    }
    return constructor(opts);
  }

  /**
   * Checks if an overlay type is registered.
   * @param type - The overlay type to check.
   * @returns True if the type is registered.
   */
  isRegistered(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * Gets all registered overlay types.
   * @returns Array of registered overlay type names.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Unregisters an overlay type.
   * @param type - The overlay type to unregister.
   */
  unregister(type: string): void {
    this.registry.delete(type);
  }
}
