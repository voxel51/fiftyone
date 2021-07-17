/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ItemData, Render, RowData, Section } from "./state";

import {
  flashLightItem,
  flashlightSection,
  flashlightSectionContainer,
} from "./styles.module.css";

export default class SectionElement implements Section {
  private attached: boolean = false;
  private top: number;
  private width: number;
  private margin: number;
  private height: number;
  private readonly container: HTMLDivElement = document.createElement("div");
  private readonly section: HTMLDivElement = document.createElement("div");
  private readonly rows: [number, [HTMLElement, ItemData][]][];

  constructor(parent: HTMLDivElement, rows: RowData[], render: Render) {
    this.container.classList.add(flashlightSectionContainer);
    this.section.classList.add(flashlightSection);
    this.rows = rows.map(({ aspectRatio, items }) => {
      return [
        aspectRatio,
        items.map((itemData) => {
          const itemElement = document.createElement("div");
          this.section.appendChild(itemElement);
          render(itemData.id, itemElement);
          return [itemElement, itemData];
        }),
      ];
    });

    parent.appendChild(this.container);
  }

  get target() {
    return this.container;
  }

  getHeight() {
    return this.height;
  }

  isShown() {
    return this.attached;
  }

  show(top: number, width: number, margin: number): void {
    const layout =
      top === this.top && width && this.width && margin === this.margin;

    if (layout && this.attached) {
      return;
    }

    if (this.top !== top) {
      this.container.style.top = `${top}px`;

      this.top = top;
    }

    if (!layout) {
      let localTop = 0;
      this.rows.forEach(([rowAspectRatio, items]) => {
        const height = (width - (items.length - 1) * margin) / rowAspectRatio;
        let left: 0;
        items.forEach(([item, { aspectRatio }]) => {
          const width = height * aspectRatio;
          item.style.height = `${height}px`;
          item.style.width = `${width}px`;
          item.style.left = `${left}px`;
          item.style.top = `${localTop}px`;

          localTop += left += width + margin;
        });
      });

      if (this.width !== width) {
        this.height = localTop;
        this.container.style.height = `${localTop}px`;
      }

      this.width = width;
      this.margin = margin;
    }

    !this.attached && this.container.appendChild(this.section);

    this.attached = true;
  }

  hide(): void {
    this.container.removeChild(this.section);
    this.attached = false;
  }
}
