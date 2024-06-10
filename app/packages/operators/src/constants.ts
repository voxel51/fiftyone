export const BROWSER_CONTROL_KEYS = ["ArrowDown", "ArrowUp", "`"];
export const PALETTE_CONTROL_KEYS = ["Enter", "Escape"];
export const RESOLVE_PLACEMENTS_TTL = 2500;
export const RESOLVE_TYPE_TTL = 500;
export const RESOLVE_INPUT_VALIDATION_TTL = 750;
export enum OPERATOR_PROMPT_AREAS {
  DRAWER_LEFT = "operator_prompt_area_drawer_left",
  DRAWER_RIGHT = "operator_prompt_area_drawer_right",
}
export enum QueueItemStatus {
  Pending,
  Executing,
  Completed,
  Failed,
}
