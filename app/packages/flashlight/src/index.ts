/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { NUM_ROWS_PER_SECTION } from "./constants";
import SectionElement from "./section";
import { Get, Optional, Options, State } from "./state";

import { flashlight } from "./styles.module.css";
import tile from "./tile";

export interface FlashlightConfig<K> {
  get: Get<K>;
  render: (id: string, element: HTMLDivElement) => void;
  initialRequestKey: K;
  options: Options;
}

export default class Flashlight<K> {
  private loading: boolean = false;
  private container: HTMLDivElement = document.createElement("div");
  private state: State<K>;
  private intersectionObserver: IntersectionObserver;

  constructor(config: FlashlightConfig<K>) {
    this.container.classList.add(flashlight);
    this.state = {
      currentRequestKey: config.initialRequestKey,
      containerHeight: null,
      width: null,
      height: 0,
      ...config,
      currentRemainder: [],
      currentRowRemainder: [],
      items: [],
      sections: [],
      sectionMap: new Map(),
      topMap: new Map(),
      indexMap: new Map(),
    };

    this.setObservers();
    this.get();
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    const { width, height } = element.getBoundingClientRect();
    this.state.width = width - 16;
    this.state.containerHeight = height;

    element.appendChild(this.container);
  }

  reset() {
    requestAnimationFrame(() => {
      this.intersectionObserver && this.intersectionObserver.disconnect();
      const newContainer = document.createElement("div");
      newContainer.classList.add(flashlight);
      this.container.replaceWith(newContainer);
      this.container = newContainer;
      this.setObservers();
    });
  }

  updateOptions(options: Optional<Options>) {}

  private get() {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.state
      .get(this.state.currentRequestKey)
      .then(({ items, nextRequestKey }) => {
        items = [...this.state.currentRemainder, ...items];

        let { rows, remainder } = tile(
          items,
          this.state.options.rowAspectRatioThreshold,
          Boolean(nextRequestKey)
        );

        this.state.currentRemainder = remainder;

        rows = [...this.state.currentRowRemainder, ...rows];

        let sections = new Array(Math.ceil(rows.length / NUM_ROWS_PER_SECTION))
          .fill(0)
          .map((_) => rows.splice(0, NUM_ROWS_PER_SECTION));

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
            section.show();
          } else if (section.isShown()) {
            section.hide();
          }
        });
      },
      {
        root: this.container.parentElement,
        threshold: 0,
      }
    );
  }
}
