/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

// adapted from https://medium.com/google-design/google-photos-45b714dfbed1
export default (
  items: number[],
  threshold: number,
  remainder: boolean
): number[] => {
  const row = (start: number, end: number) => {
    const key = `${start}:${end}`;
    if (!cache.has(key)) {
      const aspectRatio = items
        .slice(start, end)
        .reduce((sum, aspectRatio) => sum + aspectRatio, 0);
      const delta = 2 + threshold - aspectRatio;

      cache.set(key, {
        delta,
        score: Math.pow(Math.abs(delta), 3),
      });
    }

    return cache.get(key);
  };

  const cache = new Map<string, { delta: number; score: number }>();

  const nodes = new Map<
    number,
    { parent: number; score: () => number; length: () => number }
  >();
  const search = (item: number, parent?: number) => {
    const score = () => {
      if (parent === undefined) {
        return 0;
      }

      return row(parent, item).score + nodes.get(parent).score();
    };

    const length = () => {
      if (parent === undefined) {
        return 1;
      }

      return 1 + nodes.get(parent).length();
    };

    const exists = nodes.has(item);
    if (!exists || nodes.get(item).score() >= score()) {
      nodes.set(item, {
        parent,
        score,
        length,
      });
    }

    if (exists) {
      return;
    }

    let end = item + 1;
    while (end <= items.length) {
      const edge = row(item, end);

      if (edge.delta < 0 && end - item > 1) {
        break;
      }

      if (edge.delta < 0 && end - item === 1) {
        search(end, item);
      }

      if (edge.delta > 0) {
        search(end, item);
      }
      end++;
    }

    return;
  };

  search(0);

  const keys = Array.from(nodes.keys()).sort((a, b) => b - a);

  let cursor = keys[0];
  let score = nodes.get(keys[0]).score();
  const length = nodes.get(keys[0]).length();

  if (remainder) {
    for (const next of keys.slice(1)) {
      const nextScore = nodes.get(next).score();
      const nextLength = nodes.get(next).length();

      if (nextLength < length - 1) {
        break;
      }

      if (nextScore < score) {
        score = nextScore;
        cursor = next;
      }
    }
  }

  const result = [];
  while (cursor) {
    result.push(cursor);
    cursor = nodes.get(cursor)?.parent;
  }

  return result.reverse();
};
