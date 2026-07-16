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
export enum OperatorSurface {
  DATASET_SAMPLES_GRID = "dataset_samples_grid",
  DATASET_SAMPLE_MODAL = "dataset_sample_modal",
  ALL = "ALL",
}

export const FALLBACK_OPERATOR_SURFACES = [
  OperatorSurface.DATASET_SAMPLES_GRID,
  OperatorSurface.DATASET_SAMPLE_MODAL,
];
