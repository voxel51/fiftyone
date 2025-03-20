export function shouldResolveSelection(
  view,
  filters,
  patchesField,
  pointsField
) {
  const samplesType = isPatchesView(view) ? "patches" : "samples";
  const plotType = patchesField ? "patches" : "samples";
  const canUseSpatialSelection = pointsField && samplesType === plotType;
  return !canUseSpatialSelection || hasFilters(filters);
}

export function isPatchesView(view) {
  for (const stage of view) {
    if (stage?._cls === "fiftyone.core.stages.ToPatches") {
      return true;
    }
  }
  return false;
}

export function hasFilters(filters) {
  if (!filters) return false;
  return Object.keys(filters).length > 0;
}
