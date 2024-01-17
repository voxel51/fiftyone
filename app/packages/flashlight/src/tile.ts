/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

const DELTA = 1.5;

// adapted from https://medium.com/google-design/google-photos-45b714dfbed1
export default (items: number[], threshold: number): number[] => {
  const row = (start: number, end: number) => {
    const key = `${start}:${end}`;
    if (!cache.has(key)) {
      const aspectRatio = items
        .slice(start, end + 1)
        .reduce((sum, aspectRatio) => sum + aspectRatio, 0);
      const delta = threshold - aspectRatio;
      cache.set(key, {
        delta,
        score: Math.pow(Math.abs(delta), 2),
      });
    }

    return cache.get(key);
  };

  const cache = new Map<string, ReturnType<typeof row>>();

  const nodes = new Map<number, { parent: number; score: () => number }>();
  const search = (item: number, score: number, parent?: number) => {
    let end = item;

    const exists = nodes.has(item);

    if (!exists || nodes.get(item).score() >= score) {
      nodes.set(item, {
        parent,
        score: () =>
          row(parent, item).score + (nodes.get(parent)?.score() ?? 0),
      });
    }

    if (exists) {
      return;
    }

    while (end < items.length) {
      const edge = row(item, end);
      end++;

      if (edge.delta + DELTA < 0) {
        break;
      }

      if (edge.delta > DELTA) {
        continue;
      }

      search(end, score + edge.score, item);
    }

    return;
  };

  search(0, 0);

  let cursor = items.length - 1;
  const result = [];
  while (cursor) {
    result.push(cursor);
    cursor = nodes.get(cursor)?.parent;
  }

  return result.reverse();
};
