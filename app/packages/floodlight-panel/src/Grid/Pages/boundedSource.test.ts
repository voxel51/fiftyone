import { describe, expect, it, vi } from "vitest";
import { createPageSource } from "../../host/pageSource";
import { createBoundedSource } from "./boundedSource";
import { keyRange, type KeyRange } from "./model";

// an unbounded dataset of 20-item fetch pages, starting at key 0
const fetchPage = (key: number) =>
  Promise.resolve({
    items: [`item-${key}`],
    next: key + 1,
    previous: key > 0 ? key - 1 : null,
  });

const setup = (range: KeyRange) => {
  const fetch = vi.fn(fetchPage);
  const source = createPageSource(fetch);
  const bounded = createBoundedSource(source, () => range);
  return { bounded, fetch };
};

/** Follows `next` from `start` the way an instance scrolls down. */
const walk = async (
  bounded: ReturnType<typeof setup>["bounded"],
  start: number,
) => {
  const keys: number[] = [];
  let key: number | null = start;
  while (key !== null) {
    keys.push(key);
    key = (await bounded.get(key)).next;
  }
  return keys;
};

describe("createBoundedSource", () => {
  it("never fetches outside the UI page", async () => {
    const { bounded, fetch } = setup(keyRange(2, 100, 20));

    expect(await walk(bounded, 10)).toEqual([10, 11, 12, 13, 14]);
    expect(fetch.mock.calls.map(([key]) => key)).toEqual([10, 11, 12, 13, 14]);
  });

  it("ends the chain at both edges", async () => {
    const { bounded } = setup(keyRange(1, 40, 20));

    expect(await bounded.get(2)).toEqual({
      items: ["item-2"],
      next: 3,
      previous: null,
    });
    expect(await bounded.get(3)).toEqual({
      items: ["item-3"],
      next: null,
      previous: 2,
    });
  });

  it("answers an out-of-range key empty without fetching", async () => {
    const { bounded, fetch } = setup(keyRange(1, 40, 20));

    expect(await bounded.get(4)).toEqual({
      items: [],
      next: null,
      previous: null,
    });
    expect(await bounded.get(-1)).toEqual({
      items: [],
      next: null,
      previous: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the dataset's own end inside the page", async () => {
    const fetch = vi.fn((key: number) =>
      Promise.resolve({ items: [key], next: null, previous: key - 1 }),
    );
    const bounded = createBoundedSource(createPageSource(fetch), () =>
      keyRange(0, 200, 20),
    );

    expect(await bounded.get(0)).toEqual({
      items: [0],
      next: null,
      previous: null,
    });
  });

  it("serves a revisited page from memory without mutating it", async () => {
    let range = keyRange(0, 20, 20);
    const fetch = vi.fn(fetchPage);
    const source = createPageSource(fetch);
    const bounded = createBoundedSource(source, () => range);

    await bounded.get(0);
    range = keyRange(0, 40, 20);
    expect(await bounded.get(0)).toEqual({
      items: ["item-0"],
      next: 1,
      previous: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await source.get(0)).next).toBe(1);
  });
});
