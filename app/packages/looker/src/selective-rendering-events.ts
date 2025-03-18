/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Event name when a label is hovered.
 */
export const FO_LABEL_HOVERED_EVENT = "fo:labelHovered";

/**
 * Event name when a label is unhovered.
 */
export const FO_LABEL_UNHOVERED_EVENT = "fo:labelUnhovered";

/**
 * Event name when a label's selection state is toggled.
 */
export const FO_LABEL_TOGGLED_EVENT = "fo:labelToggled";

/**
 * Unique identifier for a label instance.
 */
export type InstanceId = string;

/**
 * Unique identifier for a label.
 */
export type LabelId = string;

/**
 * Data associated with label instance hovered events.
 */
export interface LabelHoveredEventData {
  /** The field related to the label, e.g. "ground_truth" */
  field: string;
  /** The instance identifier. */
  instanceId: InstanceId;
  /** The label identifier. */
  labelId: LabelId;
  /** Optional frame number. */
  frameNumber?: number;
}

/**
 * Data associated with label instance toggled events.
 */
export interface LabelToggledEventData {
  /** The source instance identifier. */
  sourceInstanceId: InstanceId;
  /** The source sample identifier. */
  sourceSampleId: string;
  /** The source label identifier. */
  sourceLabelId: LabelId;
}

/**
 * Custom event representing a label hovered action.
 */
export class LabelHoveredEvent extends CustomEvent<LabelHoveredEventData> {
  /**
   * Creates a new LabelHoveredEvent.
   * @param detail - The data associated with the label hover event.
   */
  constructor(detail: LabelHoveredEventData) {
    super(FO_LABEL_HOVERED_EVENT, { detail });
  }
}

/**
 * Custom event representing a label unhovered action.
 */
export class LabelUnhoveredEvent extends CustomEvent<null> {
  /**
   * Creates a new LabelUnhoveredEvent.
   */
  constructor() {
    super(FO_LABEL_UNHOVERED_EVENT);
  }
}

/**
 * Custom event representing a label toggled action.
 */
export class LabelToggledEvent extends CustomEvent<LabelToggledEventData> {
  /**
   * Creates a new LabelToggledEvent.
   * @param detail - The data associated with the label toggle event.
   */
  constructor(detail: LabelToggledEventData) {
    super(FO_LABEL_TOGGLED_EVENT, { detail });
  }
}

/**
 * Callback type for event handlers.
 */
export type EventCallback = (
  event: LabelHoveredEvent | LabelUnhoveredEvent | LabelToggledEvent
) => void;

/**
 * A centralized event bus for selective rendering events.
 */
export class SelectiveRenderingEventBus extends EventTarget {
  /**
   * Abort controller to manage event listeners.
   */
  #abortController = new AbortController();

  /**
   * Emits one of the following events:
   * - LabelHoveredEvent
   * - LabelUnhoveredEvent
   * - LabelToggledEvent
   *
   * @param event - The event to emit.
   */
  emit(
    event: LabelHoveredEvent | LabelUnhoveredEvent | LabelToggledEvent
  ): void {
    this.dispatchEvent(event);
  }

  /**
   * Registers an event listener for a specific event.
   * @param eventName - The name of the event to listen for.
   * @param callback - The callback to invoke when the event is fired.
   */
  on(
    eventName:
      | typeof FO_LABEL_HOVERED_EVENT
      | typeof FO_LABEL_UNHOVERED_EVENT
      | typeof FO_LABEL_TOGGLED_EVENT,
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
          this.removeEventListener(eventName, callback);
        },
        { once: true }
      );
    }

    return () => {
      this.removeEventListener(eventName, callback);
    };
  }

  /**
   * Removes all event listeners registered via this bus.
   */
  removeAllListeners(): void {
    this.#abortController.abort();
    // Reset the abort controller so new listeners can be registered.
    this.#abortController = new AbortController();
  }
}

/**
 * Singleton instance of the selective rendering event bus.
 */
export const selectiveRenderingEventBus = new SelectiveRenderingEventBus();
