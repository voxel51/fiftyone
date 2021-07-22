/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, StateUpdate } from "../state";

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

export abstract class BaseElement<
  State extends BaseState,
  Element extends HTMLElement = HTMLElement
> {
  readonly children: BaseElement<State>[] = [];
  readonly element: Element;

  constructor(
    update: StateUpdate<State>,
    dispatchEvent: (eventType: string, details?: any) => void,
    children?: BaseElement<State>[]
  ) {
    this.children = children || [];
    this.element = this.createHTMLElement(update, dispatchEvent);
    Object.entries(this.getEvents()).forEach(([eventType, handler]) => {
      this.element.addEventListener(
        eventType,
        (event) =>
          // @ts-ignore
          handler({ event, update, dispatchEvent }),
        false
      );
    });
  }

  protected getEvents(): Events<State> {
    return {};
  }

  abstract createHTMLElement(
    update: StateUpdate<State>,
    dispatchEvent: (eventType: string, details?: any) => void
  ): Element;

  isShown(state: Readonly<State>): boolean {
    return true;
  }

  render(state: Readonly<State>): Element {
    const self = this.renderSelf(state);

    this.children.forEach((child) => {
      if (!child.isShown(state)) {
        return;
      }

      const element = child.render(state);
      if (element.parentNode === this.element) {
        return;
      }
      self.appendChild(element);
    });

    return self;
  }

  abstract renderSelf(state: Readonly<State>): Element;
}
