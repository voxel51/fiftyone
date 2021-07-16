/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Get, State } from "./state";

import { flashlight } from "./styles.module.css";

export interface FlashlightConfig<K> {
  get: Get<K>;
  render: (id: string, element: HTMLDivElement) => void;
  margin: number;
}

export default class Flashlight<K> {
  private container: HTMLElement = document.createElement("div");
  private state: State<K>;

  constructor(config: FlashlightConfig<K>) {
    this.container.classList.add(flashlight);
    this.state = {
      ...config,
      width: null,
      height: null,
    };
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    const { width, height } = element.getBoundingClientRect();

    this.state.width = width;
    this.state.height = height;

    element.appendChild(this.container);
  }
}
