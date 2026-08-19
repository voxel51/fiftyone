/**
 * What a click on empty plot space clears.
 *
 * Layers come off topmost first: a selection (focus), then the legend filter
 * (scope). A search is exempt — it shares one published slot with the lasso,
 * so a count cannot tell them apart, but `origin` can, and a prompt that cost
 * a server encode plus a parquet scan is not a stray click's to throw away.
 */
export type WindowOrigin = "search" | "lasso" | "legend";

export type BackgroundClickAction = "clear-all" | "reset-legend" | "none";

export function backgroundClickAction({
  chipCount,
  origin,
  legendFilter,
}: {
  chipCount: number | null;
  /** An extension-defined origin string; only "search" is exempt. */
  origin: string | null | undefined;
  legendFilter: boolean;
}): BackgroundClickAction {
  if (chipCount && origin !== "search") return "clear-all";
  if (legendFilter) return "reset-legend";
  return "none";
}
