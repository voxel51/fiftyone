/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ItemData, Render, RowData, Section } from "./state";

import {
  flashlightSection,
  flashlightSectionContainer,
} from "./styles.module.css";

export default class SectionElement implements Section {
  private attached: boolean = false;
  private top: number;
  private width: number;
  private margin: number;
  private height: number;
  readonly index: number;
  private readonly container: HTMLDivElement = document.createElement("div");
  private readonly section: HTMLDivElement = document.createElement("div");
  private readonly rows: [
    { aspectRatio: number; extraMargins: number },
    [HTMLElement, ItemData][]
  ][];
  private readonly render: Render;
  private destoryCallbacks: { [id: string]: ReturnType<Render> };

  constructor(
    index: number,
    rows: RowData[],
    render: Render,
    onClick?: (id: string) => void
  ) {
    this.index = index;
    this.container.classList.add(flashlightSectionContainer);
    this.container.dataset.index = String(index);
    this.render = render;
    this.destoryCallbacks = {};

    this.section.classList.add(flashlightSection);
    this.rows = rows.map(({ aspectRatio, extraMargins, items }) => {
      return [
        { aspectRatio, extraMargins },
        items.map((itemData) => {
          const itemElement = document.createElement("div");
          onClick &&
            itemElement.addEventListener("click", () => onClick(itemData.id));
          this.section.appendChild(itemElement);
          return [itemElement, itemData];
        }),
      ];
    });
  }

  getItems() {
    return this.rows.map(([_, row]) => row.map(([_, data]) => data)).flat();
  }

  set(top: number, width: number, margin: number) {
    if (this.top !== top) {
      this.container.style.top = `${top}px`;

      this.top = top;
    }

    const layout = this.width !== width || this.margin !== margin;
    if (layout) {
      let localTop = 0;
      this.rows.forEach(
        ([{ extraMargins, aspectRatio: rowAspectRatio }, items]) => {
          extraMargins = extraMargins ? extraMargins : 0;
          const height =
            (width - (items.length - 1 + extraMargins) * margin) /
            rowAspectRatio;
          let left = 0;
          items.forEach(([item, { aspectRatio }]) => {
            const itemWidth = height * aspectRatio;
            item.style.height = `${height}px`;
            item.style.width = `${itemWidth}px`;
            item.style.left = `${left}px`;
            item.style.top = `${localTop}px`;

            left += itemWidth + margin;
          });

          localTop += height + margin;
        }
      );

      if (this.width !== width) {
        this.container.style.height = `${localTop}px`;
      }

      this.margin = margin;
      this.width = width;
      this.height = localTop;
      this.margin = margin;
    }
  }

  get target() {
    return this.container;
  }

  getHeight() {
    return this.height;
  }
  getTop() {
    return this.top;
  }

  hide(): void {
    return;
    if (this.attached) {
      this.container.removeChild(this.section);
      this.attached = false;
      Object.values(this.destoryCallbacks).forEach(
        (callback) => callback && callback()
      );
      this.destoryCallbacks = {};
    }
  }

  isShown() {
    return this.attached;
  }

  show(): void {
    if (!this.attached) {
      this.rows.forEach(([_, items]) =>
        items.forEach(([item, { id }]) => {
          this.destoryCallbacks[id] = this.render(id, item);
        })
      );

      this.container.appendChild(this.section);
      this.attached = true;
    }
  }
}
