/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type {
  OverlayEventData,
  OverlayErrorEventData,
  OverlayUpdatedEventData,
} from "../types";

/**
 * Event names for the lighter package.
 */
export const OVERLAY_LOADED_EVENT = "overlay-loaded";
export const OVERLAY_ERROR_EVENT = "overlay-error";
export const OVERLAY_UPDATED_EVENT = "overlay-updated";
export const UNDO_EVENT = "undo";
export const REDO_EVENT = "redo";

/**
 * Custom event for overlay loaded.
 */
export class OverlayLoadedEvent extends CustomEvent<OverlayEventData> {
  constructor(detail: OverlayEventData) {
    super(OVERLAY_LOADED_EVENT, { detail });
  }
}

/**
 * Custom event for overlay errors.
 */
export class OverlayErrorEvent extends CustomEvent<OverlayErrorEventData> {
  constructor(detail: OverlayErrorEventData) {
    super(OVERLAY_ERROR_EVENT, { detail });
  }
}

/**
 * Custom event for overlay updates.
 */
export class OverlayUpdatedEvent extends CustomEvent<OverlayUpdatedEventData> {
  constructor(detail: OverlayUpdatedEventData) {
    super(OVERLAY_UPDATED_EVENT, { detail });
  }
}

/**
 * Custom event for undo operations.
 */
export class UndoEvent extends CustomEvent<null> {
  constructor() {
    super(UNDO_EVENT);
  }
}

/**
 * Custom event for redo operations.
 */
export class RedoEvent extends CustomEvent<null> {
  constructor() {
    super(REDO_EVENT);
  }
}

/**
 * Union type of all events.
 */
export type LighterEvent =
  | OverlayLoadedEvent
  | OverlayErrorEvent
  | OverlayUpdatedEvent
  | UndoEvent
  | RedoEvent;

/**
 * Event callback type.
 */
export type EventCallback = (event: LighterEvent) => void;

/**
 * Centralized event bus for the lighter package.
 */
export class LighterEventBus extends EventTarget {
  #abortController = new AbortController();

  /**
   * Emits an event on the bus.
   */
  emit(event: LighterEvent): void {
    this.dispatchEvent(event);
  }

  /**
   * Registers an event listener.
   */
  on(
    eventName: string,
    callback: EventCallback,
    signal?: AbortSignal
  ): () => void {
    this.addEventListener(eventName, callback as EventListener, {
      signal: this.#abortController.signal,
    });

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          this.removeEventListener(eventName, callback as EventListener);
        },
        { once: true }
      );
    }

    return () => {
      this.removeEventListener(eventName, callback as EventListener);
    };
  }

  /**
   * Removes all event listeners.
   */
  removeAllListeners(): void {
    this.#abortController.abort();
    this.#abortController = new AbortController();
  }

  /**
   * Creates a new event bus instance.
   */
  static create(): LighterEventBus {
    return new LighterEventBus();
  }
}
