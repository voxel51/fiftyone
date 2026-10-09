/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * One matrix cell's pages, shared by its stack and its expanded grid so
 * expanding and collapsing read memory instead of refetching.
 */

import type { Get, Response } from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import type { ValueCount } from "../categorical";
import { createPageSource, type PageSource } from "../../host/pageSource";
import { createPageGetter, type PageVariables } from "../samplePages";
import { PAGE_SIZE } from "../useSpotlightPager";
import type { Strips } from "./context";

export type CellPage = Response<number, fos.Sample>;
export type CellSource = PageSource<number, CellPage>;

export const createCellSource = (
  strips: Strips,
  variables: PageVariables,
  recordBase: number,
): CellSource =>
  createPageSource(
    createPageGetter({
      aspectRatio: strips.aspectRatio,
      environment: strips.environment,
      limit: strips.limit,
      onPage: (page, items) =>
        items.forEach((item, i) =>
          strips.records.set(
            item.id.description,
            recordBase + page * PAGE_SIZE + i,
          ),
        ),
      pageSize: PAGE_SIZE,
      store: strips.store,
      variables,
    }),
  );

/**
 * A Floodlight `get` over a shared source. Floodlight reassigns `items` on
 * the page it starts from, so each instance reads its own copy.
 */
export const instanceGet =
  (source: CellSource): Get<number, fos.Sample> =>
  async (key) => {
    const page = await source.get(key);
    return { ...page, items: [...page.items] };
  };

/**
 * Every cell's source, created on first use and kept while the matrix is,
 * so a row that scrolls away and back reads its pages from memory.
 */
export const createCellSources = (
  strips: Strips,
  rowField: string,
  colField: string,
  span: number,
) => {
  const sources = new Map<string, CellSource>();

  return (row: ValueCount, col: ValueCount, index: number) => {
    const key = `${JSON.stringify(row.value)}|${JSON.stringify(col.value)}`;
    let source = sources.get(key);
    if (!source) {
      source = createCellSource(
        strips,
        strips.variables([
          [rowField, row.value],
          [colField, col.value],
        ]),
        index * span,
      );
      sources.set(key, source);
    }
    return source;
  };
};

export type CellSources = ReturnType<typeof createCellSources>;
