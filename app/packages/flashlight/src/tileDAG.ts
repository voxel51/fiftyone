const DELTA = 1.5;

export const tileDAG = (items: number[], threshold: number): number[] => {
  class Row {
    private readonly aspectRatio: number;
    readonly delta: number;
    readonly score: number;

    constructor(private start: number, private end: number) {
      this.aspectRatio = items
        .slice(this.start, this.end + 1)
        .reduce((sum, aspectRatio) => sum + aspectRatio, 0);

      this.delta = threshold - this.aspectRatio;
      this.score = Math.pow(Math.abs(this.delta), 2);
    }
  }

  const nodes = new Map<number, { parent?: number; score: number }>();

  const search = (item: number, score: number, parent?: number) => {
    let end = item;

    const node = nodes.get(item);
    if (node && node.score < score) {
      return;
    }

    if (node) {
      node.parent = parent;
      node.score = score;
    } else if (parent) {
      nodes.set(item, { parent, score });
    }

    while (end < items.length) {
      const edge = new Row(item, end);
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
