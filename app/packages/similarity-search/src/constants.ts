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
  [RunStatus.Pending]: TextColor.Muted,
  [RunStatus.Running]: TextColor.Info,
  [RunStatus.Completed]: TextColor.Success,
  [RunStatus.Failed]: TextColor.Destructive,
};

export const STATUS_LABELS: Record<RunStatus, string> = {
  [RunStatus.Pending]: "Pending",
  [RunStatus.Running]: "Running",
  [RunStatus.Completed]: "Completed",
  [RunStatus.Failed]: "Failed",
};

// Run list styles
export const POINTER_STYLE = { cursor: "pointer" } as const;
export const HIGHLIGHT_STYLE = {
  boxShadow: "0 0 8px 2px rgba(255, 109, 4, 0.4)",
  borderRadius: 6,
} as const;

export const THUMB_SIZE = 36;
export const THUMB_GAP = 4;
export const THUMB_SINGLE_ROW_MAX = 10;

// Maximum characters to display in a run name before truncation +
// tooltip fallback. Used in the run list and the rename tooltip.
export const MAX_RUN_NAME_LENGTH = 40;

// Maximum entries held by the sample-media LRU cache.
export const SAMPLE_MEDIA_CACHE_MAX_ENTRIES = 500;

// Consecutive fetch failures after which we stop auto-retrying
// list_similarity_runs. The user can still manually refresh.
export const RUNS_REFRESH_MAX_RETRY = 5;

// Bounds on the `k` (number of matches) input on the new-search form.
export const K_MIN = 1;
export const K_MAX = 10_000;

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
