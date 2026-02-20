import { TextColor } from "@voxel51/voodo";
import { RunStatus } from "./types";

export const SEARCH_OPERATOR_URI = "@voxel51/panels/similarity_search";
export const INIT_RUN_OPERATOR_URI = "@voxel51/panels/init_similarity_run";

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
