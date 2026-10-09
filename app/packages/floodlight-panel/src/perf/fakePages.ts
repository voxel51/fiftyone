import type { ItemData, Response } from "@fiftyone/floodlight";

export type FakeItem = ItemData<number, { page: number; index: number }>;

/** Wraps `fn` so calls are counted per key. */
export const countCalls = <K, R>(fn: (key: K) => Promise<R>) => {
  const calls = new Map<K, number>();
  return {
    fn: (key: K) => {
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return fn(key);
    },
    calls,
    get total() {
      let total = 0;
      for (const count of calls.values()) total += count;
      return total;
    },
    reset: () => calls.clear(),
  };
};

/**
 * Deterministic pages of fixed-aspect-ratio items keyed `0..pages-1`. Item
 * objects are stable per page, like a sample store; each fetch returns a
 * fresh response wrapping them.
 */
export const createFakePages = ({
  pages,
  perPage,
  aspectRatio = () => 1,
}: {
  pages: number;
  perPage: number;
  aspectRatio?: (page: number, index: number) => number;
}) => {
  const items = Array.from({ length: pages }, (_, page) =>
    Array.from(
      { length: perPage },
      (_, index): FakeItem => ({
        aspectRatio: aspectRatio(page, index),
        data: { page, index },
        id: { description: `${page}-${index}` },
        key: page,
      }),
    ),
  );

  return {
    items,
    ids: (page: number) => items[page].map(({ id }) => id.description),
    fetch: async (
      page: number,
    ): Promise<Response<number, FakeItem["data"]>> => ({
      items: [...items[page]],
      next: page < pages - 1 ? page + 1 : null,
      previous: page > 0 ? page - 1 : null,
    }),
  };
};
