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
    /** FiftyOne sample ID (sample._id), used as key in selectedSamples state */
    id: string;
    sample: TSample;
    /** Spotlight grid item identifier — holds the same sample ID string in
     *  `description`, but used for grid position lookups (e.g. shift-click range) */
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
