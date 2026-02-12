/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayConstructor } from "../overlay/OverlayFactory";
import { OverlayFactory } from "../overlay/OverlayFactory";

/**
 * Registry for plugins that extend overlay functionality.
 *
 * NOTE: THIS IS CURRENTLY UNUSED - this needs to be hooked with fiftyone plugins
 * Goal is to allow plugins to register their own overlays with the lighter library
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
