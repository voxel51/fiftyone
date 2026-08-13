interface PlotSeriesDisplayConfig {
  readonly fieldPath: string;
  readonly stream: string;
}

/** User-facing series name resolved from a canonical stream binding. */
export function plotSeriesDisplayName(
  config: PlotSeriesDisplayConfig,
  sourceNamesByBinding: ReadonlyMap<string, string>,
): string {
  const sourceName =
    sourceNamesByBinding.get(config.stream) ?? "Unknown source";
  return `${sourceName}.${config.fieldPath}`;
}

/** Compact tile title for the currently selected numeric series. */
export function plotTileDisplayTitle(
  seriesConfigs: readonly PlotSeriesDisplayConfig[],
  sourceNamesByBinding: ReadonlyMap<string, string>,
): string {
  if (seriesConfigs.length === 0) {
    return "Plot";
  }
  if (seriesConfigs.length === 1) {
    return plotSeriesDisplayName(seriesConfigs[0], sourceNamesByBinding);
  }
  return `Plot (${seriesConfigs.length})`;
}
