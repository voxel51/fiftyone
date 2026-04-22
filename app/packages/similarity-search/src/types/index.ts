/**
 * Status of a similarity search run.
 */
export enum RunStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

/**
 * Type of similarity query.
 */
export enum QueryType {
  Image = "image",
  Text = "text",
  Upload = "upload",
}

/**
 * Scope for a similarity search (full dataset or current view).
 */
export type SearchScope = "view" | "dataset";

/**
 * Configuration for a brain similarity key.
 */
export type BrainKeyConfig = {
  key: string;
  supports_prompts: boolean;
  supports_least_similarity: boolean;
  patches_field?: string;
  model?: string;
  backend?: string;
  embeddings_field?: string;
  metric?: string;
  identifiers?: { label: string; value: string }[];
};

/**
 * Data model for a similarity search run.
 */
export type SimilarityRun = {
  run_id: string;
  run_name: string;
  status: RunStatus;
  brain_key: string;
  query_type: QueryType;
  query?: string | string[];
  k?: number;
  reverse: boolean;
  dist_field?: string;
  patches_field?: string;
  negative_query_ids?: string[];
  result_ids?: string[];
  result_count: number;
  creation_time?: string;
  start_time?: string;
  end_time?: string;
  source_view?: Record<string, unknown>[];
  operator_run_id?: string;
  status_details?: string;
  created_by?: string;
  created_by_name?: string;
};

/**
 * Parameters sent to the similarity_search operator.
 * Shared between the panel's buildExecutionParams and the popover.
 */
export type SimilaritySearchParams = {
  brain_key: string;
  query_type: QueryType;
  query: string | string[];
  reverse: boolean;
  search_scope: SearchScope;
  patches_field?: string;
  k?: number;
  dist_field?: string;
  run_name?: string;
  negative_query_ids?: string[];
  dynamic_results?: boolean;
  query_image?: { content: string; name: string };
};

/**
 * Clone config returned when cloning a run.
 */
export type CloneConfig = {
  brain_key: string;
  query_type: QueryType;
  query?: string;
  k?: number;
  reverse: boolean;
  dist_field?: string;
};

/**
 * Panel data passed from Python backend.
 */
export type SimilaritySearchPanelData = {
  runs?: SimilarityRun[];
  brain_keys?: BrainKeyConfig[];
  clone_config?: CloneConfig;
};

/**
 * Date filter presets for the filter bar.
 */
export type DateFilterPreset =
  | "all"
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "older_than_30_days";

/**
 * Filter state for the runs list.
 */
export type OwnerFilter = "all" | "mine";

export type RunFilterState = {
  searchText: string;
  datePreset: DateFilterPreset;
  ownerFilter: OwnerFilter;
};

/**
 * Event names exposed by the Python panel's render() method.
 */
export type SimilaritySearchEventName =
  | "get_brain_keys"
  | "list_runs"
  | "apply_run"
  | "delete_run"
  | "bulk_delete_runs"
  | "clone_run"
  | "rename_run"
  | "on_change_view"
  | "get_sample_media";

/**
 * Schema view with panel event methods.
 */
export type SimilaritySearchSchemaView = {
  component: "SimilaritySearchView";
  composite_view?: boolean;
} & Partial<Record<SimilaritySearchEventName, string>> &
  Record<string, any>;

/**
 * Props passed to the SimilaritySearchView component.
 */
export type SimilaritySearchViewProps = {
  data?: SimilaritySearchPanelData;
  schema: {
    view: SimilaritySearchSchemaView;
    [key: string]: any;
  };
  [key: string]: any;
};
