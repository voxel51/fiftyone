/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { MARGIN, NUM_ROWS_PER_SECTION } from "./constants";
import SectionElement from "./section";
import {
  Get,
  ItemData,
  ItemIndexMap,
  OnItemClick,
  OnItemResize,
  OnResize,
  Options,
  Render,
  RowData,
  State,
} from "./state";
import { createScrollReader } from "./zooming";
export type { Render, Response } from "./state";

import {
  flashlight,
  flashlightContainer,
  flashlightPixels,
  scrollbar,
} from "./styles.module.css";
import tile from "./tile";
import { argMin, getDims } from "./util";

export type FlashlightOptions = Partial<Options>;

export interface FlashlightConfig<K> {
  get: Get<K>;
  render: Render;
  showPixels?: boolean;
  initialRequestKey: K;
  horizontal: boolean;
  options: FlashlightOptions;
  elementId?: string;
  containerId?: string;
  enableHorizontalKeyNavigation?: {
    navigationCallback: (isPrev: boolean) => Promise<void>;
    previousKey: string;
    nextKey: string;
  };
  onItemClick?: OnItemClick;
  onResize?: OnResize;
  onItemResize?: OnItemResize;
}

export default class Flashlight<K> {
  public container: HTMLDivElement;
  public element: HTMLDivElement;
  public state: State<K>;

  private loading = false;
  private resizeObserver: ResizeObserver;
  private readonly config: FlashlightConfig<K>;
  private ctx = 0;
  private resizeTimeout: ReturnType<typeof setTimeout>;

  constructor(config: FlashlightConfig<K>) {
    this.config = config;
    this.container = this.createContainer();
    this.showPixels();
    this.element = document.createElement("div");
    config.elementId && this.element.setAttribute("id", config.elementId);
    this.element.classList.add(flashlight, scrollbar);
    this.element.setAttribute("data-cy", "flashlight");
    this.state = this.getEmptyState(config);

    document.addEventListener("visibilitychange", () => this.render());

    if (config.enableHorizontalKeyNavigation && config.horizontal) {
      const keyDownEventListener = (e) => {
        if (!this.isAttached()) {
          document.removeEventListener("keydown", keyDownEventListener);
          return;
        }

        if (e.key === config.enableHorizontalKeyNavigation.previousKey) {
          e.preventDefault();
          config.enableHorizontalKeyNavigation.navigationCallback(true);
        } else if (e.key === config.enableHorizontalKeyNavigation.nextKey) {
          e.preventDefault();
          config.enableHorizontalKeyNavigation.navigationCallback(false);
        }
      };

      document.addEventListener("keydown", keyDownEventListener);
    }

    this.resizeObserver = new ResizeObserver(
      ([
        {
          contentRect: { width, height },
        },
      ]: ResizeObserverEntry[]) => {
        if (!this.isAttached()) {
          return;
        }
        if (this.config.horizontal) {
          const tmp = height;
          height = width;
          width = tmp;
        }

        this.state.containerHeight = height;

        width = width - 16;
        requestAnimationFrame(() => {
          const options =
            this.state.width !== width && this.state.onResize
              ? this.state.onResize(width)
              : {};

          const newWidth = this.state.width !== width;
          this.state.width = width;

          if (newWidth) {
            this.updateOptions(options, newWidth);
          } else {
            this.render(false);
          }
        });
      }
    );

    createScrollReader(
      this.element,
      this.config.horizontal,
      (zooming) => this.render(zooming),
      () => {
        if (this.state.resizing) {
          return Infinity;
        }

        return (
          (this.state.width /
            (this.state.containerHeight *
              Math.max(this.state.options.rowAspectRatioThreshold, 1))) *
          500
        );
      }
    );

    this.element.appendChild(this.container);
  }

  get itemIndexes(): ItemIndexMap {
    return this.state.itemIndexMap;
  }

  reset() {
    this.ctx++;
    this.loading = false;
    const newContainer = this.createContainer();
    this.container.replaceWith(newContainer);
    this.container = newContainer;
    this.state = this.getEmptyState(this.config);

    this.showPixels();
    this.element.dispatchEvent(
      new CustomEvent("flashlight-refreshing", {
        bubbles: true,
      })
    );

    const { width, height } = getDims(
      this.config.horizontal,
      this.container.parentElement
    );
    this.state.width = width - 16;
    this.state.containerHeight = height;

    this.get();
  }

  isAttached() {
    return Boolean(this.element.parentElement);
  }
  private showPixels() {
    this.container.dispatchEvent(
      new CustomEvent("flashlight-show-loading-pixels", { bubbles: true })
    );
    this.config.showPixels && this.container.classList.add(flashlightPixels);
  }

  private hidePixels() {
    this.container.dispatchEvent(
      new CustomEvent("flashlight-hide-loading-pixels", { bubbles: true })
    );
    this.container.classList.remove(flashlightPixels);
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    const { width, height } = getDims(this.config.horizontal, element);

    this.state.width = width - 16;
    this.state.containerHeight = height;

    const options = this.state.onResize ? this.state.onResize(width) : {};

    element.appendChild(this.element);

    this.resizeObserver.observe(element);

    this.updateOptions(options, false);

    this.get();
  }

  detach(): void {
    if (this.isAttached()) {
      this.resizeObserver.unobserve(this.element.parentElement);
      this.element.parentNode.removeChild(this.element);
    }
  }

  updateOptions(options: Partial<Options>, newWidth?: boolean) {
    const retile = Object.entries(options).some(
      ([k, v]) => this.state.options[k] != v
    );

    this.state.options = {
      ...this.state.options,
      ...options,
    };

    if (retile && this.state.sections.length) {
      this.resetResize();
      const newContainer = this.createContainer();
      this.container.replaceWith(newContainer);
      this.container = newContainer;
      const items = [
        ...this.state.sections.map((section) => section.getItems()).flat(),
        ...this.state.currentRowRemainder.map(({ items }) => items).flat(),
      ];
      const active = this.state.activeSection;
      const activeItemIndex = this.state.sections[active].itemIndex;
      let sections = this.tile(items);

      const lastSection = sections[sections.length - 1];
      if (
        sections.length &&
        Boolean(this.state.currentRequestKey) &&
        lastSection.length !== NUM_ROWS_PER_SECTION
      ) {
        this.state.currentRowRemainder = lastSection;
        sections = sections.slice(0, -1);
      } else {
        this.state.currentRowRemainder = [];
      }

      this.state.height = this.config.options.offset;
      this.state.sections = [];
      this.state.shownSections = new Set();
      this.state.clean = new Set();

      sections.forEach((rows, index) => {
        const sectionElement = new SectionElement(
          index,
          this.state.itemIndexMap[rows[0].items[0].id],
          rows,
          this.state.render,
          this.config.horizontal,
          this.getOnItemClick()
        );

        sectionElement.set(this.state.height, this.state.width);
        this.state.sections.push(sectionElement);

        this.state.height += sectionElement.getHeight();
      });
      if (this.config.horizontal) {
        newContainer.style.minWidth = `${this.state.height}px`;
      } else {
        newContainer.style.minHeight = `${this.state.height}px`;
      }

      for (const section of this.state.sections) {
        if (section.itemIndex >= activeItemIndex) {
          const top = section.getTop();

          if (this.config.horizontal) {
            this.container.parentElement.scrollLeft = top;
          } else {
            this.container.parentElement.scrollTop = top;
          }

          this.render();
          return;
        }
      }
    } else if (newWidth) {
      this.resetResize();
      this.state.sections.forEach((section) => {
        section.set(this.state.height, this.state.width);
        this.state.height += section.getHeight();
      });
      if (this.config.horizontal) {
        this.container.style.minWidth = `${this.state.height}px`;
      } else {
        this.container.style.minHeight = `${this.state.height}px`;
      }
      const activeSection = this.state.sections[this.state.activeSection];
      if (activeSection) {
        const top = this.state.activeSection === 0 ? 0 : activeSection.getTop();
        if (this.config.horizontal) {
          this.container.parentElement.scrollLeft = top;
        } else {
          this.container.parentElement.scrollTop = top;
        }
      }

      this.render();
    }
  }

  updateItems(updater: (id: string) => void) {
    this.state.clean = new Set();
    this.state.shownSections.forEach((index) => {
      const section = this.state.sections[index];
      section
        .getItems()
        .map(({ id }) => id)
        .forEach((id) => updater(id));
    });
    this.state.updater = updater;
  }

  get(): Promise<void> | null {
    if (
      this.loading ||
      this.state.currentRequestKey === null ||
      !this.isAttached()
    ) {
      return null;
    }

    this.loading = true;
    const ctx = this.ctx;
    return this.state
      .get(this.state.currentRequestKey, this.state.selectedMediaFieldName)
      .then(({ items, nextRequestKey }) => {
        if (ctx !== this.ctx) {
          return;
        }

        this.state.currentRequestKey = nextRequestKey;

        for (const { id } of items) {
          this.state.itemIndexMap[id] = this.state.nextItemIndex;
          this.state.nextItemIndex++;
        }

        items = [...this.state.currentRemainder, ...items];

        let sections = this.tile(items, true);

        const lastSection = sections[sections.length - 1];
        if (
          Boolean(nextRequestKey) &&
          lastSection &&
          lastSection.length !== NUM_ROWS_PER_SECTION
        ) {
          this.state.currentRowRemainder = lastSection;
          sections = sections.slice(0, -1);
        } else {
          this.state.currentRowRemainder = [];
        }

        sections.forEach((rows) => {
          const sectionElement = new SectionElement(
            this.state.sections.length,
            this.state.itemIndexMap[rows[0].items[0].id],
            rows,
            this.state.render,
            this.config.horizontal,
            this.getOnItemClick()
          );
          sectionElement.set(this.state.height, this.state.width);
          this.state.sections.push(sectionElement);

          this.state.height += sectionElement.getHeight();
          this.state.clean.add(sectionElement.index);
        });

        if (sections.length) {
          if (this.config.horizontal) {
            this.container.style.minWidth = `${this.state.height}px`;
          } else {
            this.container.style.minHeight = `${this.state.height}px`;
          }
        }

        const headSection = this.state.sections[this.state.sections.length - 1];

        this.state.currentRequestKey = nextRequestKey;
        this.loading = false;

        if (
          this.state.height <= this.state.containerHeight ||
          (!sections.length && nextRequestKey) ||
          (headSection && this.state.shownSections.has(headSection.index))
        ) {
          this.requestMore();
        }

        if (
          this.state.height >= this.state.containerHeight ||
          nextRequestKey === null
        ) {
          this.hidePixels();
          this.render();
        }
      });
  }

  private requestMore() {
    if (this.state.currentRequestKey) {
      this.get();
    }
  }

  private hideSection(index: number) {
    const section = this.state.sections[index];
    if (!section || !section.isShown()) {
      return;
    }

    section.hide();
    this.state.shownSections.delete(section.index);
  }

  private showSections(zooming: boolean) {
    this.state.shownSections.forEach((index) => {
      const section = this.state.sections[index];
      if (!section) {
        return;
      }

      if (
        this.state.resized &&
        !this.state.resized.has(section.index) &&
        !zooming &&
        !this.state.resizing
      ) {
        this.state.onItemResize && section.resizeItems(this.state.onItemResize);
        this.state.resized.add(section.index);
      }

      if (!this.state.clean.has(section.index) && !zooming) {
        this.state.updater &&
          section
            .getItems()
            .map(({ id }) => id)
            .forEach((id) => this.state.updater(id));
        this.state.clean.add(section.index);
      }

      const clean = this.state.clean.has(section.index) || !this.state.updater;
      section.show(
        this.container,
        (!clean && zooming) || this.state.resizing,
        zooming
      );
      this.state.shownSections.add(section.index);
    });
  }

  private render(zooming = false) {
    if (
      this.state.sections.length === 0 &&
      this.state.currentRequestKey === null
    ) {
      this.hidePixels();
      return;
    }

    const top = this.config.horizontal
      ? this.element.scrollLeft
      : this.element.scrollTop;

    const index = argMin(
      this.state.sections.map((section) => Math.abs(section.getTop() - top))
    );

    this.state.firstSection = Math.max(index - 2, 0);
    let revealing = this.state.sections[this.state.firstSection];
    let revealingIndex = this.state.firstSection;

    while (
      revealing &&
      revealing.getTop() <= top + this.state.containerHeight
    ) {
      revealingIndex = revealing.index + 1;
      revealing = this.state.sections[revealingIndex];
    }

    this.state.lastSection = !revealing ? revealingIndex - 1 : revealingIndex;

    this.state.activeSection = this.state.firstSection;
    let activeSection = this.state.sections[this.state.activeSection];

    if (!activeSection) {
      return;
    }

    while (activeSection.getBottom() - MARGIN <= top) {
      if (this.state.sections[this.state.activeSection + 1]) {
        this.state.activeSection += 1;
        activeSection = this.state.sections[this.state.activeSection];
      } else break;
    }

    let i = this.state.firstSection;
    while (i <= this.state.lastSection) {
      this.state.shownSections.add(i);
      i++;
    }
    [...Array.from(this.state.shownSections)].forEach((index) => {
      if (index < this.state.firstSection || index > this.state.lastSection) {
        this.hideSection(index);
      }
    });

    this.showSections(zooming);

    if (this.state.lastSection === this.state.sections.length - 1) {
      this.requestMore();
    }
  }

  private tile(items: ItemData[], useRowRemainder = false): RowData[][] {
    let { rows, remainder } = tile(
      items,
      this.config.horizontal,
      this.state.options.rowAspectRatioThreshold,
      Boolean(this.state.currentRequestKey)
    );

    this.state.currentRemainder = remainder;

    if (useRowRemainder) {
      rows = [...this.state.currentRowRemainder, ...rows];
    }

    return new Array(Math.ceil(rows.length / NUM_ROWS_PER_SECTION))
      .fill(0)
      .map((_) => rows.splice(0, NUM_ROWS_PER_SECTION));
  }

  private getEmptyState(config: FlashlightConfig<K>): State<K> {
    const state = {
      currentRequestKey: config.initialRequestKey,
      containerHeight: null,
      width: null,
      height: config.options.offset || 0,
      ...config,
      currentRemainder: [],
      currentRowRemainder: [],
      items: [],
      sections: [],
      activeSection: 0,
      firstSection: 0,
      lastSection: 0,
      options: {
        offset: 0,
        rowAspectRatioThreshold: 5,
        ...config.options,
      },
      clean: new Set<number>(),
      shownSections: new Set<number>(),
      onItemClick: config.onItemClick,
      onItemResize: config.onItemResize,
      onResize: config.onResize,
      itemIndexMap: {},
      nextItemIndex: 0,
      resized: null,
      resizing: false,
    };

    if (typeof this.state?.options?.rowAspectRatioThreshold === "number") {
      state.options.rowAspectRatioThreshold =
        this.state.options.rowAspectRatioThreshold;
    }

    return state;
  }

  private getOnItemClick(): (id: string, event: MouseEvent) => void | null {
    if (!this.state.onItemClick) {
      return null;
    }

    return (id, event) =>
      this.state.onItemClick(
        () => this.get(),
        id,
        {
          ...this.state.itemIndexMap,
        },
        event
      );
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add(flashlightContainer);
    if (this.config.containerId) {
      container.setAttribute("id", this.config.containerId);
    }
    return container;
  }

  private resetResize(): void {
    this.state.resized = new Set();
    this.state.height = this.config.options.offset || 0;
    this.state.resizing = true;
    this.resizeTimeout && clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.state.resizing = false;
      this.resizeTimeout = null;
      this.render();
    }, 500);
  }
}
