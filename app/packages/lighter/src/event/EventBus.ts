/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Overlay events that can be emitted.
 */
export type OverlayEvent =
  | { type: "overlay-loaded"; detail: { id: string } }
  | { type: "overlay-removed"; detail: { id: string } }
  | { type: "overlay-error"; detail: { id: string; error: Error } }
  | { type: "annotation-added"; detail: { id: string; annotation: any } }
  | { type: "annotation-removed"; detail: { id: string } }
  | { type: "undo"; detail: { commandId: string } }
  | { type: "redo"; detail: { commandId: string } }
  | { type: "resource-loaded"; detail: { url: string; resource: any } }
  | { type: "resource-error"; detail: { url: string; error: Error } };

/**
 * Event bus for communication between components.
 */
export class EventBus extends EventTarget {
  /**
   * Emits an event.
   * @param event - The event to emit.
   */
  emit(event: OverlayEvent): void {
    const customEvent = new CustomEvent(event.type, { detail: event.detail });
    this.dispatchEvent(customEvent);
  }

  /**
   * Registers an event listener.
   * @param type - The event type to listen for.
   * @param listener - The event listener function.
   */
  on(type: OverlayEvent["type"], listener: (e: CustomEvent) => void): void {
    this.addEventListener(type, listener as EventListener);
  }

  /**
   * Removes an event listener.
   * @param type - The event type.
   * @param listener - The event listener function.
   */
  off(type: OverlayEvent["type"], listener: (e: CustomEvent) => void): void {
    this.removeEventListener(type, listener as EventListener);
  }
}
