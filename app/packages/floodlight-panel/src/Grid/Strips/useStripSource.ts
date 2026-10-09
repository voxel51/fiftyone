/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useContext, useMemo, useRef, useState } from "react";
import { createPageSource, type PageSource } from "../../host/pageSource";
import {
  createPageGetter,
  forgetPage,
  type PageVariables,
  STRIP_PAGE_SIZE,
  STRIP_PAGES,
} from "../samplePages";
import { StripsContext } from "./context";

export type StripSource = PageSource<
  number,
  Awaited<ReturnType<ReturnType<typeof createPageGetter>>>
>;

/**
 * The pages one strip reads, kept across its rebuilds and near-viewport
 * remounts. Keyed by the query itself rather than the `variables` factory's
 * identity, so an equal query never refetches or rebuilds.
 *
 * @returns the source, and the first page's sample count (`null` until it
 *   resolves).
 */
export default function useStripSource(
  variables: PageVariables,
  recordBase: number,
) {
  const strips = useContext(StripsContext);
  if (!strips) throw new Error("useStripSource requires a StripsContext");

  const query = JSON.stringify(variables(0, STRIP_PAGE_SIZE));
  const latest = useRef(variables);
  latest.current = variables;
  const [first, setFirst] = useState<{
    count: number;
    for: StripSource;
  } | null>(null);

  const { aspectRatio, environment, limit, records, store } = strips;
  const source = useMemo(() => {
    query;
    const next: StripSource = createPageSource(
      createPageGetter({
        aspectRatio,
        environment,
        limit,
        onPage: (page, items) => {
          items.forEach((item, i) =>
            records.set(
              item.id.description,
              recordBase + page * STRIP_PAGE_SIZE + i,
            ),
          );
          page === 0 && setFirst({ count: items.length, for: next });
        },
        pageSize: STRIP_PAGE_SIZE,
        store,
        variables: (page, size) => latest.current(page, size),
      }),
      { capacity: STRIP_PAGES, onEvict: forgetPage(environment, records) },
    );
    return next;
  }, [aspectRatio, environment, limit, query, recordBase, records, store]);

  return { count: first?.for === source ? first.count : null, source };
}
