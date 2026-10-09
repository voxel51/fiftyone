/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The matrix body is one vertical Floodlight instance with an item per
 * row: its pages are chunks of the row axis values, and the rows it shows
 * are kept in a store that React renders each row into.
 */

import type { ID, Response } from "@fiftyone/floodlight";
import { createPageSource, type PageSource } from "../../host/pageSource";
import type { Renderer } from "../../host/ownership";

export const ROW_PAGE = 20;

export interface RowData {
  index: number;
}

export type RowPage = Response<number, RowData>;

/** Pages of `count` rows; ids are created once per page, so they stay stable. */
export const createRowSource = (
  count: number,
  idOf: (index: number) => string,
  pageSize = ROW_PAGE,
): PageSource<number, RowPage> =>
  createPageSource(async (page) => {
    const start = page * pageSize;
    const end = Math.min(count, start + pageSize);
    const items = [];
    for (let index = start; index < end; index++) {
      items.push({
        aspectRatio: 1,
        data: { index },
        id: { description: idOf(index) },
        key: page,
      });
    }
    return {
      items,
      next: end < count ? page + 1 : null,
      previous: page > 0 ? page - 1 : null,
    };
  });

export interface ShownRow {
  element: HTMLDivElement;
  width: number;
  height: number;
}

/** The rows Floodlight is showing, as a snapshot React subscribes to. */
export const createRowStore = () => {
  let rows = new Map<string, ShownRow>();
  const listeners = new Set<() => void>();

  const change = (apply: (next: Map<string, ShownRow>) => void) => {
    const next = new Map(rows);
    apply(next);
    rows = next;
    listeners.forEach((listener) => listener());
  };
  const remove = (id: ID) =>
    rows.has(id.description) && change((next) => next.delete(id.description));

  const renderer: Renderer<number, RowData> = {
    showItem: ({ dimensions: [width, height], element, id }) => {
      // Floodlight paints each tile; a matrix row shows the matrix behind it
      element.style.background = "transparent";
      if (element.parentElement) {
        element.parentElement.style.background = "transparent";
      }
      const shown = rows.get(id.description);
      if (
        shown?.element !== element ||
        shown.width !== width ||
        shown.height !== height
      ) {
        change((next) => next.set(id.description, { element, height, width }));
      }
      return Promise.resolve(0);
    },
    hideItem: ({ id }) => {
      remove(id);
    },
    detachItem: (id) => {
      remove(id);
    },
  };

  return {
    renderer,
    getSnapshot: () => rows,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type RowStore = ReturnType<typeof createRowStore>;
