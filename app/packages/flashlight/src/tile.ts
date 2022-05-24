import { ItemData, RowData } from "./state";

const lastRow = ({ items }: RowData, threshold: number): RowData => {
  const aspectRatios = items.map(({ aspectRatio }) => aspectRatio);
  if (aspectRatios.length && new Set(aspectRatios).size === 1) {
    let aspectRatio = aspectRatios[0];
    let singleAR = aspectRatio;
    let counter = 1;
    while (aspectRatio < threshold) {
      aspectRatio += singleAR;
      counter += 1;
    }
    return { items, aspectRatio, extraMargins: counter - items.length };
  }
  return {
    items,
    aspectRatio: Math.max(
      threshold,
      aspectRatios.reduce((acc, cur) => acc + cur, 0)
    ),
  };
};

export default function tile(
  items: ItemData[],
  rowAspectRatioThreshold: number,
  hasMore: boolean
): {
  rows: RowData[];
  remainder: ItemData[];
} {
  const rows: RowData[] = [];
  let currentRow = [];
  let currentAR = null;
  for (const i in items) {
    const item = items[i];
    if (currentAR === null) {
      currentAR = item.aspectRatio;
      currentRow.push(item);
      continue;
    }

    if (currentAR >= rowAspectRatioThreshold) {
      rows.push({ items: currentRow, aspectRatio: currentAR });
      currentRow = [item];
      currentAR = item.aspectRatio;
      continue;
    }

    currentAR += item.aspectRatio;
    currentRow.push(item);
  }

  let remainder = [];
  if (!hasMore) {
    currentRow.length &&
      rows.push(
        lastRow(
          { items: currentRow, aspectRatio: currentAR },
          rowAspectRatioThreshold
        )
      );
  } else remainder = currentRow;

  return { rows, remainder };
}
