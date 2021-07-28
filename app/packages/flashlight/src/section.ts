/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { MARGIN } from "./constants";
import { ItemData, OnItemResize, Render, RowData, Section } from "./state";

import {
  flashlightSection,
  flashlightSectionContainer,
} from "./styles.module.css";

export default class SectionElement implements Section {
  private attached: boolean = false;
  private top: number;
  private width: number;
  private height: number;
  readonly index: number;
  private readonly container: HTMLDivElement = document.createElement("div");
  private readonly section: HTMLDivElement = document.createElement("div");
  private readonly rows: [
    { aspectRatio: number; extraMargins: number },
    [HTMLDivElement, ItemData][]
  ][];
  private readonly render: Render;
  private hideCallbacks: { [id: string]: ReturnType<Render> };

  constructor(
    index: number,
    rows: RowData[],
    render: Render,
    onItemClick?: (event: MouseEvent, id: string) => void
  ) {
    this.index = index;
    this.container.classList.add(flashlightSectionContainer);
    this.container.dataset.index = String(index);
    this.render = render;
    this.hideCallbacks = {};

    this.section.classList.add(flashlightSection);
    this.rows = rows.map(({ aspectRatio, extraMargins, items }) => {
      return [
        { aspectRatio, extraMargins },
        items.map((itemData) => {
          const itemElement = document.createElement("div");
          onItemClick &&
            itemElement.addEventListener("click", (event) => {
              event.preventDefault();
              onItemClick(event, itemData.id);
            });
          this.section.appendChild(itemElement);
          return [itemElement, itemData];
        }),
      ];
    });
  }

  getItems() {
    return this.rows.map(([_, row]) => row.map(([_, data]) => data)).flat();
  }

  set(top: number, width: number) {
    if (this.top !== top) {
      this.container.style.top = `${top}px`;

      this.top = top;
    }

    if (this.width !== width) {
      let localTop = 0;
      this.rows.forEach(
        ([{ extraMargins, aspectRatio: rowAspectRatio }, items]) => {
          extraMargins = extraMargins ? extraMargins : 0;
          const height =
            (width - (items.length - 1 + extraMargins) * MARGIN) /
            rowAspectRatio;
          let left = 0;
          items.forEach(([item, { aspectRatio }]) => {
            const itemWidth = height * aspectRatio;
            item.style.height = `${height}px`;
            item.style.width = `${itemWidth}px`;
            item.style.left = `${left}px`;
            item.style.top = `${localTop}px`;

            left += itemWidth + MARGIN;
          });

          localTop += height + MARGIN;
        }
      );

      if (this.width !== width) {
        this.container.style.height = `${localTop}px`;
      }

      this.width = width;
      this.height = localTop;
    }
  }

  get target() {
    return this.container;
  }

  getHeight() {
    return this.height;
  }

  getBottom() {
    return this.top + this.height;
  }

  getTop() {
    return this.top;
  }

  hide(): void {
    if (this.attached) {
      this.container.removeChild(this.section);
      this.attached = false;
      this.hideCallbacks = {};
    }
  }

  isShown() {
    return this.attached;
  }

  show(): void {
    if (!this.attached) {
      this.rows.forEach(
        ([{ aspectRatio: rowAspectRatio, extraMargins }, items]) => {
          !extraMargins && (extraMargins = 0);
          const height =
            (this.width - (items.length - 1 + extraMargins) * MARGIN) /
            rowAspectRatio;
          items.forEach(([item, { id, aspectRatio }]) => {
            const width = height * aspectRatio;

            this.render(id, item, [width, height]);
          });
        }
      );

      this.container.appendChild(this.section);
      this.attached = true;
    }
  }

  resizeItems(resizer: OnItemResize) {
    this.rows.forEach(
      ([{ extraMargins, aspectRatio: rowAspectRatio }, items]) => {
        extraMargins = extraMargins ? extraMargins : 0;
        const height =
          (this.width - (items.length - 1 + extraMargins) * MARGIN) /
          rowAspectRatio;
        items.forEach(([_, { aspectRatio, id }]) => {
          const itemWidth = height * aspectRatio;

          resizer(id, [itemWidth, height]);
        });
      }
    );
  }
}
