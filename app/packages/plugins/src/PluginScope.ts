/**
 * Host contexts in which a plugin can be available.
 */
export enum PluginScope {
  DATASET_SAMPLES_GRID = "dataset_samples_grid",
  DATASET_SAMPLE_MODAL = "dataset_sample_modal",
  FIFTYONE_LANDING_PAGE = "fiftyone_landing_page",
  ALL = "ALL",
}

export const FALLBACK_PLUGIN_SCOPES = [
  PluginScope.DATASET_SAMPLES_GRID,
  PluginScope.DATASET_SAMPLE_MODAL,
  PluginScope.FIFTYONE_LANDING_PAGE,
];

export function normalizePluginScopes(scopes?: PluginScope[]) {
  return scopes ?? FALLBACK_PLUGIN_SCOPES;
}

/**
 * Scope profiles that require an active dataset.
 */
export const DATASET_REQUIRED_PLUGIN_SCOPES = new Set<PluginScope>([
  PluginScope.DATASET_SAMPLES_GRID,
  PluginScope.DATASET_SAMPLE_MODAL,
]);

export function scopeRequiresDataset(scope: PluginScope) {
  return DATASET_REQUIRED_PLUGIN_SCOPES.has(scope);
}

export function pluginRequiresDataset(scopes?: PluginScope[]) {
  const normalizedScopes = normalizePluginScopes(scopes);
  return (
    Boolean(normalizedScopes.length) &&
    !normalizedScopes.includes(PluginScope.ALL) &&
    normalizedScopes.every(scopeRequiresDataset)
  );
}
