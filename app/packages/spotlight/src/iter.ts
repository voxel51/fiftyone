/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Renderer, Sibling } from "./section";
import type { Focus, ID, Iter, Request } from "./types";

import { ZERO } from "./constants";
import Section from "./section";

/**
 * Implementation of the {@link Iter} interface.
 * Constructed internally by {@link Spotlight.createIter} and by each {@link Row}
 * for use in `onItemClick`; not exported directly — use the {@link Iter} interface type.
 */
export default class IterImpl<K, V> implements Iter {
  readonly #focus: Focus;
  readonly #request: Request<K, V>;
  readonly #renderer: Renderer<K, V>;
  readonly #sibling: Sibling<K, V>;

  #section: Section<K, V>;

  /**
   * @param focus - Gets or sets the currently focused item.
   * @param request - Fetches a page when the iterator needs to load more items.
   * @param renderer - Applies loaded rows to the DOM.
   * @param section - The starting section for iteration.
   * @param sibling - Returns the opposite section, used when crossing a section boundary.
   */
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

        // Section throws itself when the iterator reaches its boundary;
        // catch it, switch to the sibling, and load its first item.
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

  /**
   * Returns the per-step iteration function for the given direction.
   * Positive `from` walks forward via `iterNext`; negative walks backward via `iterPrevious`.
   * @param from - Step count with sign indicating direction.
   */
  #iter(from: number) {
    if (from >= ZERO) {
      return async (section: Section<K, V>, id: ID | undefined) =>
        section.iterNext(id, this.#request, this.#renderer, this.#sibling);
    }

    return (section: Section<K, V>, id: ID | undefined) =>
      section.iterPrevious(id, this.#request, this.#renderer, this.#sibling);
  }
}
