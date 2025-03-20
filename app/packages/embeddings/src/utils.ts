export type ViewStage = {
  _cls: string;
};

export type Filters = {
  [key: string]: {};
} | null;

const PATCHES_VIEW_STAGE = "fiftyone.core.stages.ToPatches";

export function shouldResolveSelection(
  view: ViewStage[],
  filters: Filters,
  patchesField?: string,
  pointsField?: string
) {
  const samplesType = isPatchesView(view) ? "patches" : "samples";
  const plotType = patchesField ? "patches" : "samples";
  const canUseSpatialSelection = pointsField && samplesType === plotType;
  return !canUseSpatialSelection || hasFilters(filters);
}

export function isPatchesView(view: ViewStage[]) {
  for (const stage of view) {
    if (stage?._cls === PATCHES_VIEW_STAGE) {
      return true;
    }
  }
  return false;
}

export function hasFilters(filters: Filters) {
  if (!filters) return false;
  return Object.keys(filters).length > 0;
}
