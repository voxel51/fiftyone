/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, test, vi } from "vitest";

import { DIRECTION } from "./constants";
import type { Renderer, Sibling } from "./section";
import Section from "./section";
import type { ItemData, Request, SpotlightConfig } from "./types";

const AR = 1;

const makeConfig = (
  overrides: Partial<SpotlightConfig<number, object>> = {},
): SpotlightConfig<number, object> => ({
  key: 0,
  detachItem: () => undefined,
  get: async () => ({ items: [], next: null, previous: null }),
  hideItem: () => undefined,
  maxRows: 80,
  offset: 0,
  // width 400 → threshold 4 (four unit-aspect-ratio items per row)
  rowAspectRatioThreshold: (crossExtent) => crossExtent / 100,
  showItem: async () => 0,
  spacing: 0,
  ...overrides,
});

const makeItems = (count: number): ItemData<number, object>[] =>
  Array.from({ length: count }, (_, i) => ({
    aspectRatio: AR,
    data: {},
    id: { description: `${i}` },
    key: 0,
  }));

const immediate: Renderer<number, object> = (run) => {
  run();
};

const sibling: Sibling<number, object> = () => {
  throw new Error("sibling is not used in these tests");
};

const makeRequest = (
  items: ItemData<number, object>[],
  next: number | null,
): Request<number, object> => {
  return async () => ({
    focus: (id) => id,
    items,
    next,
    previous: null,
  });
};

const makeSection = (config: SpotlightConfig<number, object>) =>
  new Section<number, object>({
    config,
    direction: DIRECTION.FORWARD,
    edge: { key: 0, remainder: [] },
    crossExtent: 400,
  });

describe("Section.rescale", () => {
  test("recomputes row geometry without changing row membership", async () => {
    const section = makeSection(makeConfig());
    await section.next(makeRequest(makeItems(8), null), immediate, sibling);

    // 8 unit items at threshold 4 → two rows of four, each 100px
    expect(section.length).toBe(2);
    expect(section.primaryExtent).toBe(200);

    section.rescale(200);

    // membership is untouched — still two rows — but each row now spans
    // 200px / 4 items = 50px
    expect(section.length).toBe(2);
    expect(section.primaryExtent).toBe(100);
    for (let i = 0; i < 8; i++) {
      expect(section.find(`${i}`)).not.toBeNull();
    }

    // scaling back restores the original geometry exactly
    section.rescale(400);
    expect(section.length).toBe(2);
    expect(section.primaryExtent).toBe(200);
  });

  test("recomputes row offsets cumulatively with spacing", async () => {
    const section = new Section<number, object>({
      config: makeConfig({ spacing: 10 }),
      direction: DIRECTION.FORWARD,
      edge: { key: 0, remainder: [] },
      crossExtent: 400,
    });
    await section.next(makeRequest(makeItems(8), null), immediate, sibling);

    // rows of four at width 400 with spacing: clean width 370 → rows of
    // 92.5px, second row offset by row + spacing
    expect(section.find("4").from).toBeCloseTo(102.5);

    section.rescale(200);

    // clean width 170 at threshold 2 keeps four items per row (membership
    // is fixed), so rows are 42.5px and the second row sits at 52.5px
    expect(section.find("4").from).toBeCloseTo(52.5);
  });

  test("calls resizeItem only for attached rows", async () => {
    const resizeItem = vi.fn();
    const section = makeSection(makeConfig({ resizeItem }));
    await section.next(makeRequest(makeItems(8), null), immediate, sibling);

    // no rows have been shown; a rescale must not fan out to items
    section.rescale(200);
    expect(resizeItem).not.toHaveBeenCalled();

    const container = document.createElement("div");
    section.attach(container);
    section.render({
      measure: undefined,
      spotlight: {} as never,
      target: 0,
      threshold: () => true,
      top: 0,
      updater: () => undefined,
      zooming: false,
    });

    section.rescale(400);

    // both rows are attached; every item receives its new dimensions
    expect(resizeItem).toHaveBeenCalledTimes(8);
    const { dimensions } = resizeItem.mock.calls[0][0];
    // width 400, spacing 0 → four 100px square items per row
    expect(dimensions).toEqual([100, 100]);
  });
});
