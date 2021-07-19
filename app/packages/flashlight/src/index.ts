/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { NUM_ROWS_PER_SECTION } from "./constants";
import SectionElement from "./section";
import { Get, Optional, Options, RowData, State } from "./state";

import { flashlight } from "./styles.module.css";
import tile from "./tile";

export interface FlashlightOptions extends Optional<Options> {}

export interface FlashlightConfig<K> {
  get: Get<K>;
  render: (id: string, element: HTMLDivElement) => void;
  initialRequestKey: K;
  options: FlashlightOptions;
}

export default class Flashlight<K> {
  private loading: boolean = false;
  private container: HTMLDivElement = document.createElement("div");
  private state: State<K>;
  private intersectionObserver: IntersectionObserver;
  private resizeObserver: ResizeObserver;

  constructor(config: FlashlightConfig<K>) {
    this.container.classList.add(flashlight);
    this.state = this.getEmptyState(config);

    this.setObservers();
    this.get();

    let attached = false;

    this.resizeObserver = new ResizeObserver(
      ([
        {
          contentRect: { width },
        },
      ]: ResizeObserverEntry[]) => {
        if (!attached) {
          attached = true;
          return;
        }

        this.reposition(width);
      }
    );
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    const { width, height } = element.getBoundingClientRect();
    this.state.width = width - 16;
    this.state.containerHeight = height;

    element.appendChild(this.container);

    this.resizeObserver.observe(element);
  }

  updateOptions(options: Optional<Options>) {
    const retile = Object.entries(options).some(
      ([k, v]) => this.state.options[k] != v
    );

    this.state.options = {
      ...this.state.options,
      ...options,
    };

    if (retile) {
      requestAnimationFrame(() => {
        const sections = this.tile(
          this.state.sections.map((section) => section.getItems())
        );
        this.intersectionObserver.disconnect();

        this.intersectionObserver && this.intersectionObserver.disconnect();
        this.setObservers();
        const newContainer = document.createElement("div");
        newContainer.classList.add(flashlight);

        this.state.height = 0;
        this.state.sections = [];
        this.state.shownSections = new Set();
        this.state.clean = new Set();

        const targets = [];
        sections.forEach((rows) => {
          const sectionElement = new SectionElement(
            this.state.sections.length,
            rows,
            this.state.render
          );
          sectionElement.set(
            this.state.height,
            this.state.width,
            this.state.options.margin
          );
          this.state.sections.push(sectionElement);
          newContainer.appendChild(sectionElement.target);

          this.state.height += sectionElement.getHeight();
          targets.push(sectionElement.target);
        });
        targets.forEach((target) => this.intersectionObserver.observe(target));

        newContainer.style.height = `${this.state.height}px`;

        this.container.replaceWith(newContainer);
        this.container = newContainer;
      });
    }
  }

  updateItems(updater: (id: string) => void) {
    requestAnimationFrame(() => {
      this.state.clean = new Set();
      this.state.shownSections.forEach((index) => {
        const section = this.state.sections[index];
        section
          .getItems()
          .map(({ id }) => id)
          .forEach((id) => updater(id));
      });
      this.state.updater = updater;
    });
  }

  private get() {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.state
      .get(this.state.currentRequestKey)
      .then(({ items, nextRequestKey }) => {
        this.state.currentRequestKey = nextRequestKey;

        items = [...this.state.currentRemainder, ...items];

        let sections = this.tile(items);

        const lastSection = sections[sections.length - 1];
        if (
          Boolean(nextRequestKey) &&
          lastSection.length !== NUM_ROWS_PER_SECTION
        ) {
          this.state.currentRowRemainder = lastSection;
          sections = sections.slice(0, -1);

          sections.length === 0 && this.get();
        } else {
          this.state.currentRowRemainder = [];
        }

        const targets = [];
        sections.forEach((rows) => {
          const sectionElement = new SectionElement(
            this.state.sections.length,
            rows,
            this.state.render
          );
          sectionElement.set(
            this.state.height,
            this.state.width,
            this.state.options.margin
          );
          this.state.sections.push(sectionElement);
          this.container.appendChild(sectionElement.target);

          this.state.height += sectionElement.getHeight();
          targets.push(sectionElement.target);
          this.state.clean.add(sectionElement.index);
        });

        if (sections.length) {
          this.container.style.height = `${this.state.height}px`;
        }

        this.state.currentRequestKey = nextRequestKey;

        targets.forEach((target) => this.intersectionObserver.observe(target));
        this.loading = false;

        if (
          this.state.height <= this.state.containerHeight ||
          (!sections.length && nextRequestKey)
        ) {
          this.get();
        }
      });
  }

  private setObservers() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const { target } = entry;
          const section = this.state.sections[
            parseInt((target as HTMLDivElement).dataset.index, 10)
          ];

          if (entry.intersectionRatio > 0) {
            const lastSection = this.state.sections[
              this.state.sections.length - 1
            ];
            if (this.state.currentRequestKey && lastSection.target === target) {
              this.get();
            }

            if (!this.state.clean.has(section.index)) {
              section
                .getItems()
                .map(({ id }) => id)
                .forEach((id) => this.state.updater(id));
            }
            section.show();
            this.state.shownSections.add(section.index);
            this.state.activeSection = section.index;
          } else if (section.isShown()) {
            section.hide();
            this.state.shownSections.delete(section.index);
          }
        });
      },
      {
        root: this.container.parentElement,
        threshold: 0,
      }
    );
  }

  private tile(items): RowData[][] {
    let { rows, remainder } = tile(
      items,
      this.state.options.rowAspectRatioThreshold,
      Boolean(this.state.currentRequestKey)
    );

    this.state.currentRemainder = remainder;

    rows = [...this.state.currentRowRemainder, ...rows];

    return new Array(Math.ceil(rows.length / NUM_ROWS_PER_SECTION))
      .fill(0)
      .map((_) => rows.splice(0, NUM_ROWS_PER_SECTION));
  }

  private reposition(width: number) {
    requestAnimationFrame(() => {
      const activeSection = this.state.sections[this.state.activeSection];
      if (width === this.state.width) {
        return;
      }

      this.state.width = width;
      let height = 0;
      this.state.sections.forEach((section) => {
        section.set(height, width, this.state.options.margin);
        height += section.getHeight();
      });

      this.container.style.height = `${height}px`;
      activeSection.target.scrollTo();
    });
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
      options: {
        rowAspectRatioThreshold: 5,
        margin: 3,
        ...config.options,
      },
      clean: new Set(),
      shownSections: new Set(),
    };
  }
}
