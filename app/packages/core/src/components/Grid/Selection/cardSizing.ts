import {
  CARD_HEIGHT,
  CARD_MIN_WIDTH,
  cardWidth,
  MULTIMODAL_CARD_HEIGHT,
  MULTIMODAL_CARD_WIDTH,
  STRIP_GAP,
} from "./theme";

export type TrayItem = { aspectRatio: number | null } | { fold: true };

/** Largest common card height whose wrapped rows fit the available space. */
export function fitCardHeight(
  items: readonly TrayItem[],
  width: number,
  height: number,
  multimodal: boolean,
) {
  const minimum = multimodal ? MULTIMODAL_CARD_HEIGHT : CARD_HEIGHT;
  if (!items.length || width <= 0 || height <= 0) return minimum;
  // Compact strips shrink previews to fit; keep the two card borders intact.
  if (height <= minimum) return Math.max(2, Math.floor(height));

  const fits = (cardHeight: number) => {
    let rows = 1;
    let rowWidth = 0;
    for (const item of items) {
      const naturalWidth =
        "fold" in item
          ? multimodal
            ? MULTIMODAL_CARD_WIDTH
            : CARD_MIN_WIDTH
          : multimodal
            ? cardHeight
            : cardWidth(item.aspectRatio, cardHeight);
      // Cards at the minimum height shrink proportionally in narrow buckets.
      // Larger cards must fit its width before growing with the tray.
      if (naturalWidth > width && cardHeight > minimum) return false;
      const itemWidth = Math.min(width, naturalWidth);
      if (rowWidth > 0 && rowWidth + STRIP_GAP + itemWidth > width) {
        rows++;
        rowWidth = itemWidth;
      } else {
        rowWidth += (rowWidth > 0 ? STRIP_GAP : 0) + itemWidth;
      }
    }
    return rows * cardHeight + (rows - 1) * STRIP_GAP <= height;
  };

  // Width and row count only increase with height. If the minimum cannot
  // fit, retain it and let the container scroll instead of shrinking cards.
  let low = minimum;
  let high = Math.floor(height);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
}
