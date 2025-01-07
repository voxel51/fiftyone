/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { ONE, THREE, ZERO } from "./constants";

// adapted from https://medium.com/google-design/google-photos-45b714dfbed1
export default (
  items: number[],
  threshold: number,
  useRemainder: boolean
): number[] => {
  if (threshold < ONE) {
    throw new TilingException(
      `threshold must be greater than 1, received ${threshold}`
    );
  }

  if (!items.length) {
    return [];
  }

  const aspectRatios = new Set(items);
  if (aspectRatios.size === ONE) {
    let ar = items[ZERO];
    let count = ONE;
    while (ar < threshold) {
      count++;
      ar += items[ZERO];
    }

    const result = [];
    let size = count;
    while (size <= items.length) {
      result.push(size);
      size += count;
    }

    if (useRemainder && !result.includes(items.length)) {
      result.push(items.length);
    }

    return result;
  }

  const findCursor = () => {
    const keys = Array.from(nodes.keys()).sort((a, b) => b - a);
    if (useRemainder) {
      return keys[ZERO];
    }

    let cursor: number;
    let score = Number.POSITIVE_INFINITY;
    let length: number;

    for (const next of keys) {
      const node = nodes.get(next);
      const nextScore = node.score();

      if (node.length() < length) {
        break;
      }

      if (score === undefined || nextScore < score) {
        score = nextScore;
        cursor = next;
        length = node.length();
      } else break;
    }

    return cursor;
  };

  const row = (start: number, end: number) => {
    const key = `${start}:${end}`;
    if (!cache.has(key)) {
      const aspectRatio = items
        .slice(start, end)
        .reduce((sum, aspectRatio) => sum + aspectRatio, ZERO);
      const delta = threshold - aspectRatio;
      cache.set(key, {
        delta,
        score: (ONE + Math.abs(delta)) ** THREE,
      });
    }

    return cache.get(key);
  };

  const cache = new Map<string, { delta: number; score: number }>();

  const nodes = new Map<
    number,
    { length: () => number; parent: number; score: () => number }
  >();
  const search = (parent: number, item: number) => {
    const score = () => {
      if (parent === ZERO) {
        return row(parent, item).score;
      }

      return row(parent, item).score + nodes.get(parent)?.score() || ZERO;
    };

    const length = () => {
      if (parent === ZERO) {
        return ONE;
      }

      return ONE + nodes.get(parent).length();
    };

    const node = nodes.get(item);
    if (!node) {
      nodes.set(item, {
        length,
        parent,
        score,
      });
    } else {
      if (node.score() >= score()) {
        nodes.set(item, {
          length,
          parent,
          score,
        });
      }
      return;
    }

    let end = item + ONE;
    while (end <= items.length) {
      const edge = row(item, end);
      if (edge.delta <= ZERO) {
        search(item, end);
      }

      end++;
    }

    return;
  };

  search(ZERO, ZERO);
  let cursor = findCursor();

  const result = [];
  while (cursor) {
    result.push(cursor);
    cursor = nodes.get(cursor)?.parent;
  }

  result.reverse();
  if (useRemainder && !result.includes(items.length)) {
    result.push(items.length);
  }

  return result;
};

export class TilingException extends Error {}
