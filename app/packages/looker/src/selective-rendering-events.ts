/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { EventDispatcher } from "@fiftyone/events";

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
  /** The sample identifier. */
  sampleId: string;
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

/** What the selective rendering bus sends, by event name */
export type SelectiveRenderingEvents = {
  [FO_LABEL_HOVERED_EVENT]: LabelHoveredEventData;
  [FO_LABEL_UNHOVERED_EVENT]: null;
  [FO_LABEL_TOGGLED_EVENT]: LabelToggledEventData;
};

type SelectiveRenderingEventName = keyof SelectiveRenderingEvents;

/**
 * A label hovered action, as listeners receive it.
 * @deprecated to send one, `dispatch` {@link FO_LABEL_HOVERED_EVENT}
 */
export class LabelHoveredEvent {
  readonly type = FO_LABEL_HOVERED_EVENT;
  /** keeps the listeners after this one from receiving the event */
  declare readonly stopImmediatePropagation: () => void;

  constructor(readonly detail: LabelHoveredEventData) {}
}

/**
 * A label unhovered action, as listeners receive it.
 * @deprecated to send one, `dispatch` {@link FO_LABEL_UNHOVERED_EVENT}
 */
export class LabelUnhoveredEvent {
  readonly type = FO_LABEL_UNHOVERED_EVENT;
  readonly detail = null;
  /** keeps the listeners after this one from receiving the event */
  declare readonly stopImmediatePropagation: () => void;
}

/**
 * A label toggled action, as listeners receive it.
 * @deprecated to send one, `dispatch` {@link FO_LABEL_TOGGLED_EVENT}
 */
export class LabelToggledEvent {
  readonly type = FO_LABEL_TOGGLED_EVENT;
  /** keeps the listeners after this one from receiving the event */
  declare readonly stopImmediatePropagation: () => void;

  constructor(readonly detail: LabelToggledEventData) {}
}

type SelectiveRenderingEvent =
  | LabelHoveredEvent
  | LabelUnhoveredEvent
  | LabelToggledEvent;

/**
 * Callback type for event handlers.
 */
export type EventCallback = (event: SelectiveRenderingEvent) => void;

/**
 * A centralized event bus for selective rendering events. Listeners run in
 * the order they were added.
 */
type Delivered = {
  readonly type: SelectiveRenderingEventName;
  readonly detail: unknown;
  readonly stopImmediatePropagation: () => void;
};

export class SelectiveRenderingEventBus {
  #bus = new EventDispatcher<Record<SelectiveRenderingEventName, Delivered>>();
  readonly #stopped = new WeakSet<Delivered>();

  /**
   * Sends `event` to its listeners, which receive `{ type, detail }`.
   */
  dispatch<E extends SelectiveRenderingEventName>(
    event: E,
    detail: SelectiveRenderingEvents[E],
  ): void {
    const delivered: Delivered = {
      type: event,
      detail,
      stopImmediatePropagation: () => this.#stopped.add(delivered),
    };
    this.#bus.dispatch<SelectiveRenderingEventName>(event, delivered);
  }

  /**
   * Sends one of the label events built by its class.
   * @deprecated use {@link SelectiveRenderingEventBus.dispatch}
   */
  emit(event: SelectiveRenderingEvent): void {
    this.dispatch(event.type, event.detail as never);
  }

  /**
   * Registers an event listener for a specific event.
   * @param eventName - The name of the event to listen for.
   * @param callback - The callback to invoke when the event is fired.
   * @param signal - Removes the listener when aborted.
   */
  on(
    eventName: SelectiveRenderingEventName,
    callback: EventCallback,
    signal?: AbortSignal,
  ): () => void {
    if (signal?.aborted) {
      return () => undefined;
    }

    const off = this.#bus.on(eventName, (event) => {
      if (!this.#stopped.has(event)) {
        callback(event as SelectiveRenderingEvent);
      }
    });
    signal?.addEventListener("abort", off, { once: true });
    return off;
  }

  /**
   * Removes all event listeners registered via this bus.
   */
  removeAllListeners(): void {
    this.#bus.clearAll();
  }
}

/**
 * Singleton instance of the selective rendering event bus.
 */
export const selectiveRenderingEventBus = new SelectiveRenderingEventBus();
