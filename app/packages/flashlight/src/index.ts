/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Get, Response, State } from "./state";

import { flashlight } from "./styles.module.css";

interface FlashlightConfig<K> {
  get: Get<K>;
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

  attach(element: HTMLDivElement) {
    const { width, height } = element.getBoundingClientRect();

    this.state.width = width;
    this.state.height = height;

    element.appendChild(this.container);
  }
}
