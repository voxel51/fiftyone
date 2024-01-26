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
        .slice(start, end)
        .reduce((sum, aspectRatio) => sum + aspectRatio, 0);
      const delta = threshold - aspectRatio;
      cache.set(key, {
        delta,
        score: Math.pow(Math.abs(delta), 2),
      });
    }

    return cache.get(key);
  };

  const cache = new Map<string, { delta: number; score: number }>();

  const nodes = new Map<number, { parent: number; score: () => number }>();
  const search = (item: number, parent?: number) => {
    const score = () => {
      if (parent === undefined) {
        return 0;
      }

      return row(parent, item).score + nodes.get(parent).score();
    };

    const exists = nodes.has(item);
    if (!exists || nodes.get(item).score() >= score()) {
      nodes.set(item, {
        parent,
        score,
      });
    }

    if (exists) {
      return;
    }

    let end = item + 1;
    while (end < items.length) {
      const edge = row(item, end);
      end++;

      if (edge.delta + DELTA < 0) {
        break;
      }

      if (edge.delta > DELTA) {
        continue;
      }

      search(end, item);
    }

    return;
  };

  search(0);

  const keys = Array.from(nodes.keys()).sort((a, b) => b - a);

  let cursor = keys[0];
  let score = nodes.get(keys[0]).score();
  for (const next of keys.slice(1)) {
    const nextScore = nodes.get(next).score();
    if (nextScore > score) {
      break;
    }

    score = nextScore;
    cursor = next;
  }

  const result = [];
  while (cursor) {
    result.push(cursor);
    cursor = nodes.get(cursor)?.parent;
  }

  return result.reverse();
};
