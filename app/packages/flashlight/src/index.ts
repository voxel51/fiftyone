/**
 * Copyright 2017-2024, Voxel51, Inc.
 */
import { MARGIN } from "./constants";
import { Get, ItemData, Options, Render, RowData, State } from "./state";
import { flashlight, flashlightContainer } from "./styles.module.css";
import tile from "./tile";
import { argMin, getDims } from "./util";
import { createScrollReader } from "./zooming";
export type { Render, Response } from "./state";

export type FlashlightOptions = Partial<Options>;

export interface FlashlightConfig<K> {
  get: Get<K>;
  render: Render;
  key: K;
  options: FlashlightOptions;
}

export default class Flashlight<K> extends EventTarget {
  public container: HTMLDivElement;
  public element: HTMLDivElement;
  public state: State<K>;

  private readonly config: FlashlightConfig<K>;

  constructor(config: FlashlightConfig<K>) {
    super();
    this.config = config;
    this.container = this.createContainer();
    this.element = document.createElement("div");
    this.element.classList.add(flashlight);
    this.state = this.getEmptyState(config);

    document.addEventListener("visibilitychange", () => this.render());

    createScrollReader(
      this.element,
      (zooming) => this.render(zooming),
      () => {
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

  isAttached() {
    return Boolean(this.element.parentElement);
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    const { width, height } = getDims(element);

    this.state.width = width - 16;
    this.state.containerHeight = height;

    element.appendChild(this.element);

    this.get();
  }

  detach(): void {
    if (this.isAttached()) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  get(): Promise<void> | null {
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
          this.render();
        }
      });
  }

  private hideSection(index: number) {
    const section = this.state.sections[index];
    if (!section || !section.isShown()) {
      return;
    }

    section.hide();
  }

  private render(zooming = false) {
    if (
      this.state.sections.length === 0 &&
      this.state.currentRequestKey === null
    ) {
      return;
    }

    const top = this.element.scrollTop;

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
      this.state.options.rowAspectRatioThreshold
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
      itemIndexMap: {},
      nextItemIndex: 0,
    };

    return state;
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add(flashlightContainer);
    return container;
  }
}
