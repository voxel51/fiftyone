/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

type SelectionSymbol = {
  description: string;
};

export type ThumbnailSelectionModifiers = {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export type ThumbnailSelectionDetail<TSample = unknown> =
  ThumbnailSelectionModifiers & {
    id: string;
    sample: TSample;
    symbol: SelectionSymbol;
  };

export const getThumbnailSelectionModifiers = (
  eventLike: Partial<ThumbnailSelectionModifiers>
): ThumbnailSelectionModifiers => ({
  shiftKey: Boolean(eventLike.shiftKey),
  altKey: Boolean(eventLike.altKey),
  ctrlKey: Boolean(eventLike.ctrlKey),
  metaKey: Boolean(eventLike.metaKey),
});

export const buildThumbnailSelectionDetail = <TSample>({
  id,
  sample,
  symbol,
  modifiers,
}: {
  id: string;
  sample: TSample;
  symbol: SelectionSymbol;
  modifiers?: Partial<ThumbnailSelectionModifiers>;
}): ThumbnailSelectionDetail<TSample> => ({
  ...getThumbnailSelectionModifiers(modifiers || {}),
  id,
  sample,
  symbol,
});
