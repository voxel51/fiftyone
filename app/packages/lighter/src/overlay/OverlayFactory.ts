/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BaseOverlay } from "./BaseOverlay";
import { DetectionOverlay } from "./DetectionOverlay";
import { ClassificationOverlay } from "./ClassificationOverlay";
import { ImageOverlay } from "./ImageOverlay";
import { KeypointOverlay } from "./KeypointOverlay";
import { PolylineOverlay } from "./PolylineOverlay";
import { TemporalOverlay } from "./TemporalOverlay";

type OptionsOf<C extends abstract new (...args: never[]) => unknown> =
  ConstructorParameters<C>[0];

/**
 * Constructor type for overlays.
 */
export type OverlayConstructor<T = unknown> = (opts: T) => BaseOverlay;

/**
 * Factory for creating overlays.
 */
export class OverlayFactory {
  // constructors take different option types; `create` restores the caller's
  private registry = new Map<string, OverlayConstructor<never>>();

  /**
   * Creates a factory instance with built-in overlays pre-registered.
   * @returns A factory instance with all built-in overlays registered.
   */
  static createWithBuiltIns(): OverlayFactory {
    const factory = new OverlayFactory();

    // Register built-in overlays
    factory.register(
      "detection",
      (opts: OptionsOf<typeof DetectionOverlay>) => new DetectionOverlay(opts),
    );
    factory.register(
      "classification",
      (opts: OptionsOf<typeof ClassificationOverlay>) =>
        new ClassificationOverlay(opts),
    );
    factory.register(
      "image",
      (opts: OptionsOf<typeof ImageOverlay>) => new ImageOverlay(opts),
    );
    factory.register(
      "keypoint",
      (opts: OptionsOf<typeof KeypointOverlay>) => new KeypointOverlay(opts),
    );
    factory.register(
      "polyline",
      (opts: OptionsOf<typeof PolylineOverlay>) => new PolylineOverlay(opts),
    );
    factory.register(
      "temporal",
      (opts: OptionsOf<typeof TemporalOverlay>) => new TemporalOverlay(opts),
    );

    return factory;
  }

  /**
   * Registers an overlay type with its constructor.
   * @param type - The overlay type identifier.
   * @param constructor - The constructor function.
   */
  register<T>(type: string, constructor: OverlayConstructor<T>): void {
    this.registry.set(type, constructor as OverlayConstructor<never>);
  }

  /**
   * Creates an overlay of the specified type with type safety for built-in overlays.
   * @param type - The overlay type to create.
   * @param opts - Options to pass to the constructor.
   * @returns The created overlay.
   * @throws Error if the overlay type is not registered.
   */
  create<T = unknown, R = BaseOverlay>(type: string, opts: T): R {
    const constructor = this.registry.get(type) as
      | OverlayConstructor<T>
      | undefined;
    if (!constructor) {
      throw new Error(`Overlay type '${type}' is not registered`);
    }
    return constructor(opts) as R;
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
