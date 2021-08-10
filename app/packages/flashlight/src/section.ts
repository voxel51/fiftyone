/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { MARGIN } from "./constants";
import { ItemData, OnItemResize, Render, RowData, Section } from "./state";

import {
  flashlightSection,
  flashlightSectionHidden,
} from "./styles.module.css";

export default class SectionElement implements Section {
  private attached: boolean = false;
  private top: number;
  private width: number;
  private height: number;
  private hidden: boolean;
  readonly index: number;
  readonly itemIndex: number;
  private readonly section: HTMLDivElement = document.createElement("div");
  private readonly rows: [
    { aspectRatio: number; extraMargins: number },
    [HTMLDivElement, ItemData][]
  ][];
  private readonly render: Render;

  constructor(
    index: number,
    itemIndex: number,
    rows: RowData[],
    render: Render,
    onItemClick?: (event: MouseEvent, id: string) => void
  ) {
    this.index = index;
    this.itemIndex = itemIndex;
    this.render = render;

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
      this.section.style.top = `${top}px`;

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
        this.section.style.height = `${localTop}px`;
        this.section.style.width = `${width}px`;
      }

      this.width = width;
      this.height = localTop;
    }
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
      this.section.remove();
      this.attached = false;
    }
  }

  isShown() {
    return this.attached;
  }

  show(element: HTMLDivElement, hidden: boolean, soft: boolean): void {
    if (hidden !== this.hidden) {
      hidden
        ? this.section.classList.add(flashlightSectionHidden)
        : this.section.classList.remove(flashlightSectionHidden);
      this.hidden = hidden;
    }

    if (!this.attached) {
      element.appendChild(this.section);
      this.attached = true;
    }

    !this.hidden &&
      this.rows.forEach(
        ([{ aspectRatio: rowAspectRatio, extraMargins }, items]) => {
          !extraMargins && (extraMargins = 0);
          const height =
            (this.width - (items.length - 1 + extraMargins) * MARGIN) /
            rowAspectRatio;
          items.forEach(([item, { id, aspectRatio }]) => {
            const width = height * aspectRatio;

            this.render(id, item, [width, height], soft);
          });
        }
      );
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
