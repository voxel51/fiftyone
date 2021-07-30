/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { NUM_ROWS_PER_SECTION } from "./constants";
import SectionElement from "./section";
import {
  Get,
  ItemData,
  OnItemClick,
  OnResize,
  OnItemResize,
  Optional,
  Options,
  Render,
  RowData,
  State,
} from "./state";

import { flashlight } from "./styles.module.css";
import tile from "./tile";
import { argMin } from "./util";
import zooming from "./zooming.svg";

export interface FlashlightOptions extends Optional<Options> {}

export interface FlashlightConfig<K> {
  get: Get<K>;
  render: Render;
  initialRequestKey: K;
  options: FlashlightOptions;
  onItemClick?: OnItemClick;
  onResize?: OnResize;
  onItemResize?: OnItemResize;
}

export default class Flashlight<K> {
  private loading: boolean = false;
  private container: HTMLDivElement = document.createElement("div");
  private state: State<K>;
  private resizeObserver: ResizeObserver;
  private readonly config: FlashlightConfig<K>;
  private lastScrollTop: number;
  private lastRender: number;
  private pixelsSet: boolean;

  constructor(config: FlashlightConfig<K>) {
    this.config = config;
    this.container.classList.add(flashlight);
    this.showPixels();
    this.state = this.getEmptyState(config);

    let attached = false;

    let animation = null;

    this.resizeObserver = new ResizeObserver(
      ([
        {
          contentRect: { width, height },
        },
      ]: ResizeObserverEntry[]) => {
        this.state.containerHeight = height;
        if (!attached) {
          attached = true;
          return;
        }

        typeof animation === "number" && cancelAnimationFrame(animation);
        animation = requestAnimationFrame(() => {
          const options =
            this.state.width !== width && this.state.onResize
              ? this.state.onResize(width)
              : {};

          const force = this.state.width !== width;

          this.state.width = width;

          this.updateOptions(options, force);
          animation = null;
        });
      }
    );
  }

  reset() {
    const newContainer = document.createElement("div");
    newContainer.classList.add(flashlight);
    this.container.replaceWith(newContainer);
    this.container = newContainer;
    this.state = this.getEmptyState(this.config);

    const {
      width,
      height,
    } = this.container.parentElement.getBoundingClientRect();
    this.state.width = width - 16;
    this.state.containerHeight = height;

    this.get();
  }

  isAttached() {
    return Boolean(this.container.parentElement);
  }
  private showPixels() {
    !this.pixelsSet &&
      (this.container.style.backgroundImage = `url(${zooming})`);
    this.pixelsSet = true;
  }

  private hidePixels() {
    this.pixelsSet && (this.container.style.backgroundImage = "unset");
    this.pixelsSet = false;
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    const { width, height } = element.getBoundingClientRect();
    this.state.width = width - 16;
    this.state.containerHeight = height;

    let timeout = null;

    element.addEventListener("scroll", () => {
      this.render();

      timeout && clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.render(true);
        timeout = null;
      }, 100);
    });

    element.appendChild(this.container);

    this.resizeObserver.observe(element);
    this.get();
  }

  updateOptions(options: Optional<Options>, force: boolean = false) {
    const retile = Object.entries(options).some(
      ([k, v]) => this.state.options[k] != v
    );

    this.state.options = {
      ...this.state.options,
      ...options,
    };

    if (retile || force) {
      this.state.resized = new Set();
      const newContainer = document.createElement("div");
      newContainer.classList.add(flashlight);
      this.container.replaceWith(newContainer);
      this.container = newContainer;
      const items = [
        ...this.state.sections.map((section) => section.getItems()).flat(),
        ...this.state.currentRowRemainder.map(({ items }) => items).flat(),
      ];
      const activeItemIndex = this.state.sections[this.state.activeSection]
        .itemIndex;
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

      this.state.height = 0;
      this.state.sections = [];
      this.state.shownSections = new Set();
      this.state.clean = new Set();

      sections.forEach((rows, index) => {
        const sectionElement = new SectionElement(
          index,
          this.state.itemIndexMap[rows[0].items[0].id],
          rows,
          this.state.render,
          this.getOnItemClick()
        );
        sectionElement.set(this.state.height, this.state.width);
        this.state.sections.push(sectionElement);

        this.state.height += sectionElement.getHeight();
      });
      newContainer.style.height = `${this.state.height}px`;

      for (const section of this.state.sections) {
        if (section.itemIndex >= activeItemIndex) {
          this.container.parentElement.scrollTo(0, section.getTop());
          this.render(true);
          break;
        }
      }
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
    if (this.loading || this.state.currentRequestKey === null) {
      return null;
    }

    this.loading = true;
    return this.state
      .get(this.state.currentRequestKey)
      .then(({ items, nextRequestKey }) => {
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
            this.getOnItemClick()
          );
          sectionElement.set(this.state.height, this.state.width);
          this.state.sections.push(sectionElement);

          this.state.height += sectionElement.getHeight();
          this.state.clean.add(sectionElement.index);
        });

        if (sections.length) {
          this.container.style.height = `${this.state.height}px`;
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
    if (
      this.state.currentRequestKey &&
      this.state.lastSection === this.state.sections.length - 1
    ) {
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

  private showSections() {
    this.state.shownSections.forEach((index) => {
      const section = this.state.sections[index];
      if (!section || section.isShown()) {
        return;
      }

      if (this.state.resized && !this.state.resized.has(section.index)) {
        this.state.onItemResize &&
          this.state.onItemResize &&
          section.resizeItems(this.state.onItemResize);
        this.state.resized.add(section.index);
      }

      if (!this.state.clean.has(section.index)) {
        this.state.updater &&
          section
            .getItems()
            .map(({ id }) => id)
            .forEach((id) => this.state.updater(id));
        this.state.clean.add(section.index);
      }
      section.show(this.container);
      this.state.shownSections.add(section.index);
    });
  }

  private render(force = false) {
    requestAnimationFrame(() => {
      const top = this.container.parentElement.scrollTop;
      const time = performance.now();

      const timeDelta = this.lastRender ? time - this.lastRender : 1000;
      const pixelDelta = Math.abs(top - this.lastScrollTop);

      if (
        !force &&
        this.lastScrollTop !== null &&
        pixelDelta / timeDelta > 25
      ) {
        this.showPixels();
        this.state.zooming = true;

        [...this.state.shownSections].forEach((index) =>
          this.hideSection(index)
        );

        return;
      }
      this.lastRender = time;
      this.lastScrollTop = top;
      this.hidePixels();
      this.state.zooming = false;

      const index = argMin(
        this.state.sections.map((section) => Math.abs(section.getTop() - top))
      );

      this.state.firstSection = Math.max(index - 2, 0);
      let revealing = this.state.sections[this.state.firstSection];
      let revealingIndex = this.state.firstSection;

      do {
        revealingIndex = revealing.index + 1;
        revealing = this.state.sections[revealingIndex];
      } while (
        revealing &&
        revealing.getTop() <= top + this.state.containerHeight
      );

      this.state.lastSection = !revealing ? revealingIndex - 1 : revealingIndex;
      this.state.sections[this.state.lastSection + 1] &&
        this.state.lastSection++;

      this.state.activeSection = this.state.firstSection;
      while (this.state.sections[this.state.activeSection].getBottom() < top) {
        if (this.state.sections[this.state.activeSection + 1]) {
          this.state.activeSection += 1;
        } else break;
      }

      let i = this.state.firstSection;
      while (i <= this.state.lastSection) {
        this.state.shownSections.add(i);
        i++;
      }

      [...this.state.shownSections].forEach((index) => {
        if (index < this.state.firstSection || index > this.state.lastSection) {
          this.hideSection(index);
        }
      });

      this.state.zooming
        ? [...this.state.shownSections].forEach((s) => {
            this.state.sections[s].hide();
            this.state.shownSections.delete(s);
          })
        : this.showSections();
      this.requestMore();
    });
  }

  private tile(items: ItemData[], useRowRemainder = false): RowData[][] {
    let { rows, remainder } = tile(
      items,
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
    return {
      currentRequestKey: config.initialRequestKey,
      containerHeight: null,
      width: null,
      height: 0,
      ...config,
      currentRemainder: [],
      currentRowRemainder: [],
      items: [],
      sections: [],
      activeSection: 0,
      firstSection: 0,
      lastSection: 0,
      options: {
        rowAspectRatioThreshold: 5,
        ...config.options,
      },
      clean: new Set(),
      shownSections: new Set(),
      onItemClick: config.onItemClick,
      onItemResize: config.onItemResize,
      onResize: config.onResize,
      itemIndexMap: {},
      nextItemIndex: 0,
      resized: null,
      zooming: false,
    };
  }

  private getOnItemClick(): (event: MouseEvent, id: string) => void | null {
    if (!this.state.onItemClick) {
      return null;
    }

    return (event, id) =>
      this.state.onItemClick(event, id, { ...this.state.itemIndexMap });
  }
}
