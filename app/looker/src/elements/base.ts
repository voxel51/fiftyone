/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, StateUpdate } from "../state";

export type Events<State extends BaseState> = {
  [K in keyof HTMLElementEventMap]?: (args: {
    event: HTMLElementEventMap[K];
    update: StateUpdate<State>;
    dispatchEvent: (eventType: string, details?: any) => void;
  }) => void;
};

export abstract class BaseElement<
  State extends BaseState,
  Element extends HTMLElement = HTMLElement
> {
  readonly children: BaseElement<State>[] = [];
  readonly element: Element;
  eventTarget?: Element | HTMLElement;

  constructor(
    update: StateUpdate<State>,
    dispatchEvent: (eventType: string, details?: any) => void,
    children?: BaseElement<State>[]
  ) {
    this.children = children;
    this.element = this.createHTMLElement(update);
    Object.entries(this.getEvents()).forEach(([eventType, callback]) => {
      const target = this.eventTarget ?? this.element;
      target.addEventListener(eventType, (event) =>
        // @ts-ignore
        callback({ event, update, dispatchEvent })
      );
    });
  }

  protected getEvents(): Events<State> {
    return {};
  }

  abstract createHTMLElement(update: StateUpdate<State>): Element;

  isShown(state: Readonly<State>): boolean {
    return true;
  }

  render(state: Readonly<State>): Element {
    const self = this.renderSelf(state);
    const children = this.renderChildren(state);

    children.forEach((child, i) => {
      const isShown = this.children[i].isShown(state);
      if (child.parentNode === this.element) {
        if (!isShown) {
          this.element.removeChild(child);
        }
        return;
      }
      if (isShown) self.appendChild(child);
    });
    return self;
  }

  renderChildren(state: Readonly<State>): HTMLElement[] {
    return this.children.map((child) => child.renderSelf(state));
  }

  abstract renderSelf(state: Readonly<State>): Element;
}
