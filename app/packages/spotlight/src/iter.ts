/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Renderer, Sibling } from "./section";
import type { Focus, ID, Request } from "./types";

import { ZERO } from "./constants";
import Section from "./section";

export default class Iter<K, V> {
  readonly #focus: Focus;
  readonly #request: Request<K, V>;
  readonly #renderer: Renderer<K, V>;
  readonly #sibling: Sibling<K, V>;

  #section: Section<K, V>;

  constructor(
    focus: Focus,
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    section: Section<K, V>,
    sibling: Sibling<K, V>
  ) {
    this.#focus = focus;
    this.#request = request;
    this.#renderer = renderer;
    this.#section = section;
    this.#sibling = sibling;
  }

  async next(from: number, soft?: boolean) {
    let answer = this.#focus();

    let current = Math.abs(from);
    const iter = this.#iter(from);
    let section = this.#section;

    while (current !== ZERO) {
      let result: ID;
      try {
        result = await iter(section, answer);
        if (!result) {
          if (soft) {
            answer = undefined;
          }
          break;
        }
      } catch (e) {
        if (!(e instanceof Section)) {
          throw e;
        }

        section = e;
        result = await section.first(
          this.#request,
          this.#renderer,
          this.#sibling
        );
      }

      answer = result;
      current--;
    }

    if (!soft) {
      this.#section = section;
      this.#sibling(true);
      answer && this.#focus(answer);
    }
    return answer;
  }

  #iter(from: number) {
    if (from >= ZERO) {
      return async (section: Section<K, V>, id: ID | undefined) =>
        section.iterNext(id, this.#request, this.#renderer, this.#sibling);
    }

    return (section: Section<K, V>, id: ID | undefined) =>
      section.iterPrevious(id, this.#request, this.#renderer, this.#sibling);
  }
}
