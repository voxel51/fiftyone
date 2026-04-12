import { TextColor } from "@voxel51/voodo";
import { DateFilterPreset, OwnerFilter, RunStatus, SearchScope } from "./types";

export const SEARCH_OPERATOR_URI = "@voxel51/panels/similarity_search";
export const INIT_RUN_OPERATOR_URI = "@voxel51/panels/init_similarity_run";
export const COMPUTE_SIMILARITY_URI = "@voxel51/operators/compute_similarity";
export const PANEL_NAME = "similarity_search_panel";
export const LIST_RUNS_OPERATOR_URI = "@voxel51/panels/list_similarity_runs";
export const SSE_OPERATOR_URI =
  "@voxel51/panels/get_similarity_search_subscription_notifier";

export const DAY_MS = 86_400_000;

export const DATE_PRESET_OPTIONS = [
  { id: "all", data: { label: "All time" } },
  { id: "today", data: { label: "Today" } },
  { id: "last_7_days", data: { label: "Last 7 days" } },
  { id: "last_30_days", data: { label: "Last 30 days" } },
  { id: "older_than_30_days", data: { label: "Older than 30 days" } },
];

export const STATUS_COLORS: Record<RunStatus, TextColor> = {
  pending: TextColor.Muted,
  running: TextColor.Info,
  completed: TextColor.Success,
  failed: TextColor.Destructive,
};

export const STATUS_LABELS: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export const THUMB_SIZE = 36;
export const THUMB_GAP = 4;
export const THUMB_SINGLE_ROW_MAX = 10;

// Filter defaults
export const DEFAULT_DATE_PRESET: DateFilterPreset = "last_30_days";
export const OWNER_ALL: OwnerFilter = "all";
export const OWNER_MINE: OwnerFilter = "mine";

// File upload constraints
export const UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
export const UPLOAD_ACCEPTED_TYPES = ".png,.jpg,.jpeg,.webp,.bmp,.tiff";

// Search scope values
export const SCOPE_VIEW: SearchScope = "view";
export const SCOPE_DATASET: SearchScope = "dataset";

// Unicode display characters
export const MIDDLE_DOT = "\u00B7";
export const CHECK_MARK = "\u2705";
export const CROSS_MARK = "\u274C";
