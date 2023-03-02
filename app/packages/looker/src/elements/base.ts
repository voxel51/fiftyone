/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { BaseState, DispatchEvent, Sample, StateUpdate } from "../state";

type ElementEvent<State extends BaseState, E extends Event> = (args: {
  event: E;
  update: StateUpdate<State>;
  dispatchEvent: DispatchEvent;
}) => void;

export type Events<State extends BaseState> = {
  [K in keyof HTMLElementEventMap]?: ElementEvent<
    State,
    HTMLElementEventMap[K]
  >;
};

type LoadedEvents = {
  [K in keyof HTMLElementEventMap]?: HTMLElementEventMap[K];
};

export abstract class BaseElement<
  State extends BaseState,
  Element extends HTMLElement = HTMLElement | null
> {
  children: BaseElement<State>[] = [];
  element: Element;
  protected readonly events: LoadedEvents = {};

  boot(
    config: Readonly<State["config"]>,
    update: StateUpdate<State>,
    dispatchEvent: (eventType: string, details?: any) => void
  ) {
    if (!this.isShown(config)) {
      return;
    }

    this.element = this.createHTMLElement(update, dispatchEvent, config);

    for (const [eventType, handler] of Object.entries(this.getEvents())) {
      this.events[eventType] = (event) =>
        handler({ event, update, dispatchEvent });
      this.element &&
        this.element.addEventListener(eventType, this.events[eventType]);
    }
  }
  applyChildren(children: BaseElement<State>[]) {
    this.children = children || [];
  }

  isShown(config: Readonly<State["config"]>): boolean {
    return true;
  }

  render(state: Readonly<State>, sample: Readonly<Sample>): Element | null {
    const self = this.renderSelf(state, sample);
    this.children.forEach((child) => {
      if (!child.isShown(state.config)) {
        return;
      }

      const element = child.render(state, sample);
      if (!element || element.parentNode === this.element) {
        return;
      }
      self && self.appendChild(element);
    });

    return self;
  }

  abstract createHTMLElement(
    update: StateUpdate<State>,
    dispatchEvent: (eventType: string, details?: any) => void,
    config: Readonly<State["config"]>
  ): Element | null;

  abstract renderSelf(
    state: Readonly<State>,
    sample: Readonly<Sample>
  ): Element | null;

  protected getEvents(): Events<State> {
    return {};
  }

  protected removeEvents() {
    for (const eventType in this.events) {
      this.element.removeEventListener(eventType, this.events[eventType]);
    }
  }

  protected attachEvents() {
    for (const eventType in this.events) {
      this.element.addEventListener(eventType, this.events[eventType]);
    }
  }
}
