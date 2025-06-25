/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { OverlayFactory } from "../overlay/OverlayFactory";
import type { OverlayConstructor } from "../overlay/OverlayFactory";

/**
 * Registry for plugins that extend overlay functionality.
 */
export class PluginRegistry {
  private overlayFactory: OverlayFactory;

  constructor(overlayFactory: OverlayFactory) {
    this.overlayFactory = overlayFactory;
  }

  /**
   * Registers a new overlay type.
   * @param type - The overlay type identifier.
   * @param constructor - The constructor function.
   */
  registerOverlay(type: string, constructor: OverlayConstructor): void {
    this.overlayFactory.register(type, constructor);
  }

  /**
   * Unregisters an overlay type.
   * @param type - The overlay type to unregister.
   */
  unregisterOverlay(type: string): void {
    this.overlayFactory.unregister(type);
  }

  /**
   * Checks if an overlay type is registered.
   * @param type - The overlay type to check.
   * @returns True if the type is registered.
   */
  isOverlayRegistered(type: string): boolean {
    return this.overlayFactory.isRegistered(type);
  }

  /**
   * Gets all registered overlay types.
   * @returns Array of registered overlay type names.
   */
  getRegisteredOverlays(): string[] {
    return this.overlayFactory.getRegisteredTypes();
  }

  /**
   * Gets the underlying overlay factory.
   * @returns The overlay factory instance.
   */
  getOverlayFactory(): OverlayFactory {
    return this.overlayFactory;
  }
}
