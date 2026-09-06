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
  // Some formats (LeRobot features) already carry the source name in the
  // field path; repeating it reads as "action.action.gripper.pos".
  if (
    config.fieldPath === sourceName ||
    config.fieldPath.startsWith(`${sourceName}.`) ||
    config.fieldPath.startsWith(`${sourceName}[`)
  ) {
    return config.fieldPath;
  }
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
