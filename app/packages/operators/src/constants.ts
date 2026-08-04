export const BROWSER_CONTROL_KEYS = ["ArrowDown", "ArrowUp", "`"];
export const PALETTE_CONTROL_KEYS = ["Enter", "Escape"];
export const RESOLVE_PLACEMENTS_TTL = 2500;
export const RESOLVE_TYPE_TTL = 500;
export const RESOLVE_INPUT_VALIDATION_TTL = 750;
export enum OPERATOR_PROMPT_AREAS {
  DRAWER_LEFT = "operator_prompt_area_drawer_left",
  DRAWER_RIGHT = "operator_prompt_area_drawer_right",
}
export const PANEL_LOAD_TIMEOUT = 10000;
export enum QueueItemStatus {
  Pending,
  Executing,
  Completed,
  Failed,
}
export const PANEL_STATE_CHANGE_DEBOUNCE = 500;
export const PANEL_STATE_PATH_CHANGE_DEBOUNCE = 250;
export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  DANGEROUS = "dangerous",
}
export enum OperatorScope {
  DATASET_SAMPLES_GRID = "dataset_samples_grid",
  DATASET_SAMPLE_MODAL = "dataset_sample_modal",
  FIFTYONE_LANDING_PAGE = "fiftyone_landing_page",
  ALL = "ALL",
}

export const FALLBACK_OPERATOR_SCOPES = [
  OperatorScope.DATASET_SAMPLES_GRID,
  OperatorScope.DATASET_SAMPLE_MODAL,
  OperatorScope.FIFTYONE_LANDING_PAGE,
];

export function normalizeOperatorScopes(scopes?: OperatorScope[]) {
  return scopes ?? FALLBACK_OPERATOR_SCOPES;
}

/**
 * Surface profiles define the minimum host context an operator may assume.
 * Operators that target only these surfaces require an active dataset.
 */
export const DATASET_REQUIRED_OPERATOR_SCOPES = new Set<OperatorScope>([
  OperatorScope.DATASET_SAMPLES_GRID,
  OperatorScope.DATASET_SAMPLE_MODAL,
]);

export function scopeRequiresDataset(scope: OperatorScope) {
  return DATASET_REQUIRED_OPERATOR_SCOPES.has(scope);
}

/**
 * Whether an operator requires an active dataset on every supported surface.
 * Omitted JavaScript metadata is legacy/unrestricted and therefore must not
 * acquire a dataset requirement retroactively.
 */
export function operatorRequiresDataset(scopes?: OperatorScope[]) {
  const normalizedScopes = normalizeOperatorScopes(scopes);
  return (
    Boolean(normalizedScopes.length) &&
    !normalizedScopes.includes(OperatorScope.ALL) &&
    normalizedScopes.every(scopeRequiresDataset)
  );
}
