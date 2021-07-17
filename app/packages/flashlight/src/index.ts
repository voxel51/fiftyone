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
  private container: HTMLDivElement = document.createElement("div");
  private state: State<K>;
  private resizeObserver: ResizeObserver;
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
      currentTop: 0,
    };
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    const { width, height } = element.getBoundingClientRect();

    this.state.width = width;
    this.state.containerHeight = height;

    element.appendChild(this.container);
  }

  reset() {
    requestAnimationFrame(() => {
      this.intersectionObserver && this.intersectionObserver.disconnect();
      this.resizeObserver && this.resizeObserver.disconnect();
      const newContainer = document.createElement("div");
      newContainer.classList.add(flashlight);
      this.container.replaceWith(newContainer);
      this.container = newContainer;
      this.setObservers();
    });
  }

  updateOptions(options: Optional<Options>) {}

  private get() {
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

        let sections = new Array(
          Math.ceil(rows.length / NUM_ROWS_PER_SECTION)
        ).map((_) => rows.splice(0, NUM_ROWS_PER_SECTION));

        const lastSection = sections[sections.length - 1];
        if (
          Boolean(nextRequestKey) &&
          lastSection.length !== NUM_ROWS_PER_SECTION
        ) {
          this.state.currentRowRemainder = lastSection;
          sections = sections.slice(0, -1);
        } else {
          this.state.currentRowRemainder = [];
        }

        sections.forEach((rows) => {
          const sectionElement = new SectionElement(
            this.container,
            rows,
            this.state.render
          );
          this.state.sectionMap.set(sectionElement.target, {
            top: sectionElement.computeHeight(this.state.width),
            section: sectionElement,
          });
          this.state.sections.push(sectionElement);
          this.intersectionObserver.observe(sectionElement.target);
        });
      });
  }

  private setObservers() {
    this.resizeObserver = new ResizeObserver(() => {});
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target }) => {
          const { top, section } = this.state.sectionMap.get(
            target as HTMLDivElement
          );
          if (section.isShown()) {
            section.hide();
          } else {
            section.show(this.state.options.margin, top, this.state.width);
          }
        });
      },
      {
        root: this.container,
        threshold: 0,
      }
    );
  }

  private retile() {
    let top = 0;
  }
}
