import { SimilarityRun, DateFilterPreset, QueryType } from "./types";
import { DAY_MS } from "./constants";

export const formatQuery = (run: SimilarityRun): string => {
  if (run.query_type === "text" && typeof run.query === "string") {
    return run.query.length > 50
      ? run.query.substring(0, 50) + "..."
      : run.query;
  }
  if (run.query_type === "image") {
    const count = Array.isArray(run.query) ? run.query.length : 0;
    const negCount = run.negative_query_ids?.length ?? 0;
    let label = `Image similarity (${count} ${
      count === 1 ? "sample" : "samples"
    })`;
    if (negCount > 0) {
      label += ` \u00B7 ${negCount} negative`;
    }
    return label;
  }
  return run.query_type;
};

export const formatTime = (isoString?: string): string => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
};

export const pluralizeRuns = (count: number): string => {
  return `${count} ${count === 1 ? "run" : "runs"}`;
};

export const getDateRange = (
  preset: DateFilterPreset
): { start: Date | null; end: Date | null } => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  switch (preset) {
    case "today":
      return { start: startOfToday, end: null };
    case "last_7_days":
      return {
        start: new Date(startOfToday.getTime() - 7 * DAY_MS),
        end: null,
      };
    case "last_30_days":
      return {
        start: new Date(startOfToday.getTime() - 30 * DAY_MS),
        end: null,
      };
    case "older_than_30_days":
      return {
        start: null,
        end: new Date(startOfToday.getTime() - 30 * DAY_MS),
      };
    default:
      return { start: null, end: null };
  }
};

export const matchesText = (run: SimilarityRun, text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    run.run_name.toLowerCase().includes(lower) ||
    (typeof run.query === "string" &&
      run.query.toLowerCase().includes(lower)) ||
    run.brain_key.toLowerCase().includes(lower)
  );
};

export const matchesDate = (
  run: SimilarityRun,
  start: Date | null,
  end: Date | null
): boolean => {
  if (!start && !end) return true;
  if (!run.creation_time) return false;

  const runDate = new Date(run.creation_time);
  if (start && runDate < start) return false;
  if (end && runDate > end) return false;
  return true;
};

export const canSubmitSearch = (
  brainKey: string,
  queryType: QueryType,
  textQuery: string,
  queryIdCount: number
): boolean => {
  if (!brainKey) return false;
  if (queryType === "text" && !textQuery.trim()) return false;
  if (queryType === "image" && queryIdCount === 0) return false;
  return true;
};

export type BuildExecutionParamsInput = {
  brainKey: string;
  queryType: QueryType;
  textQuery: string;
  queryIds: string[];
  reverse: boolean;
  patchesField?: string;
  searchScope: "view" | "dataset";
  hasView: boolean;
  view: unknown[];
  k: number | "";
  distField: string;
  runName: string;
  negativeQueryIds: string[];
};

export const buildExecutionParams = (
  input: BuildExecutionParamsInput
): Record<string, any> => {
  const {
    brainKey,
    queryType,
    textQuery,
    queryIds,
    reverse,
    patchesField,
    searchScope,
    hasView,
    view,
    k,
    distField,
    runName,
    negativeQueryIds,
  } = input;

  const query = queryType === "text" ? textQuery.trim() : queryIds;

  const params: Record<string, any> = {
    brain_key: brainKey,
    query_type: queryType,
    query,
    reverse,
    patches_field: patchesField,
  };

  if (searchScope === "view" && hasView) {
    params.source_view = view;
  }

  if (k !== "") params.k = k;
  if (distField.trim()) params.dist_field = distField.trim();
  if (runName.trim()) params.run_name = runName.trim();

  if (negativeQueryIds.length > 0) {
    params.negative_query_ids = negativeQueryIds;
  }

  return params;
};
