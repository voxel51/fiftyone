/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export interface EventMap {
  [key: string]: (args: {
    event: Event;
    update: (state: object) => void;
  }) => void;
}

export abstract class BaseElement {
  readonly children: BaseElement[] = [];
  readonly element: HTMLElement;
  events: EventMap = {};
  eventTarget?: Element;

  constructor(update: (state: any) => void, children?: BaseElement[]) {
    this.children = children;
    this.element = this.createHTMLElement();
    Object.entries(this.events).forEach(([eventType, callback]) => {
      const target = this.eventTarget ?? this.element;
      target.addEventListener(eventType, (event) =>
        callback({ event, update })
      );
    });
  }

  abstract createHTMLElement(): HTMLElement;

  isShown(state): boolean {
    return true;
  }

  render(state): Element {
    const self = this.renderSelf(state);
    const children = this.renderChildren(state);

    children.forEach((child, i) => {
      const isShown = this.children[i].isShown(state);
      if (child.parentNode === this.element) {
        if (isShown) {
          this.element.removeChild(child);
        }
        return;
      }
      if (isShown) self.appendChild(child);
    });
    return self;
  }

  renderChildren(state): Element[] {
    return this.children.map((child) => child.renderSelf(state));
  }

  abstract renderSelf(state): Element;
}
