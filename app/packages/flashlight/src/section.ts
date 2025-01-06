/**
 * Copyright 2017-2025, Voxel51, Inc.
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
  private horizontal: boolean;
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
    horizontal: boolean,
    onItemClick?: (id: string, event: MouseEvent) => void
  ) {
    this.index = index;
    this.itemIndex = itemIndex;
    this.horizontal = horizontal;
    this.render = render;

    this.section.classList.add(flashlightSection);

    if (horizontal) {
      this.section.setAttribute("data-cy", "flashlight-section-horizontal");
    } else {
      this.section.setAttribute("data-cy", "flashlight-section");
    }

    this.rows = rows.map(({ aspectRatio, extraMargins, items }) => {
      return [
        { aspectRatio, extraMargins },
        items.map((itemData) => {
          const itemElement = document.createElement("div");

          if (onItemClick) {
            itemElement.addEventListener("click", (event) => {
              event.preventDefault();
              onItemClick(itemData.id, event);
            });
            itemElement.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              onItemClick(itemData.id, event);
            });
          }

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
      const setting = `${top}px`;
      if (this.horizontal) {
        this.section.style.left = setting;
      } else {
        this.section.style.top = setting;
      }

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
            if (this.horizontal) {
              aspectRatio = 1 / aspectRatio;
            }
            const itemWidth = height * aspectRatio;

            if (this.horizontal) {
              item.style.width = `${height}px`;
              item.style.height = `${itemWidth}px`;
              item.style.top = `${left}px`;
              item.style.left = `${localTop}px`;
            } else {
              item.style.height = `${height}px`;
              item.style.width = `${itemWidth}px`;
              item.style.left = `${left}px`;
              item.style.top = `${localTop}px`;
            }

            left += itemWidth + MARGIN;
          });

          localTop += height + MARGIN;
        }
      );

      if (this.width !== width) {
        if (this.horizontal) {
          this.section.style.width = `${localTop}px`;
          this.section.style.height = `${width}px`;
        } else {
          this.section.style.height = `${localTop}px`;
          this.section.style.width = `${width}px`;
        }
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
      this.rows.forEach(
        ([{ aspectRatio: rowAspectRatio, extraMargins }, items]) => {
          !extraMargins && (extraMargins = 0);
          const height =
            (this.width - (items.length - 1 + extraMargins) * MARGIN) /
            rowAspectRatio;
          items.forEach(([item, { id, aspectRatio }]) => {
            if (this.horizontal) {
              aspectRatio = 1 / aspectRatio;
            }
            const width = height * aspectRatio;

            this.render(
              id,
              item,
              this.horizontal ? [height, width] : [width, height],
              false,
              true
            );
          });
        }
      );
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
            if (this.horizontal) {
              aspectRatio = 1 / aspectRatio;
            }
            const width = height * aspectRatio;

            this.render(
              id,
              item,
              this.horizontal ? [height, width] : [width, height],
              soft,
              false
            );
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
          if (this.horizontal) {
            aspectRatio = 1 / aspectRatio;
          }
          const itemWidth = height * aspectRatio;

          resizer(
            id,
            this.horizontal ? [height, itemWidth] : [itemWidth, height]
          );
        });
      }
    );
  }
}
