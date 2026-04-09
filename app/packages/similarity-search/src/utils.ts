import { getFetchParameters } from "@fiftyone/utilities";
import {
  SimilarityRun,
  DateFilterPreset,
  QueryType,
  SearchScope,
} from "./types";
import { DAY_MS, QUERY_TEXT, QUERY_IMAGE } from "./constants";

export const formatQuery = (run: SimilarityRun): string => {
  if (run.query_type === QUERY_TEXT && typeof run.query === "string") {
    return run.query.length > 50
      ? run.query.substring(0, 50) + "..."
      : run.query;
  }
  if (run.query_type === QUERY_IMAGE) {
    const count = Array.isArray(run.query) ? run.query.length : 0;
    const negCount = run.negative_query_ids?.length ?? 0;
    if (negCount > 0) {
      return `Image similarity (${count} positive, ${negCount} negative)`;
    }
    return `Image similarity (${count} ${count === 1 ? "prompt" : "prompts"})`;
  }
  return run.query_type;
};

export const formatTime = (isoString?: string): string => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
};

export const pluralizeSearches = (count: number): string => {
  return `${count} ${count === 1 ? "search" : "searches"}`;
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
  if (isNaN(runDate.getTime())) return false;
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
  if (queryType === QUERY_TEXT && !textQuery.trim()) return false;
  if (queryType === QUERY_IMAGE && queryIdCount === 0) return false;
  return true;
};

export type BuildExecutionParamsInput = {
  brainKey: string;
  queryType: QueryType;
  textQuery: string;
  queryIds: string[];
  reverse: boolean;
  patchesField?: string;
  searchScope: SearchScope;
  hasView: boolean;
  view: unknown[];
  k: number | "";
  distField: string;
  runName: string;
  negativeQueryIds: string[];
  dynamicResults: boolean;
};

export function getMediaUrl(filepath: string): string {
  const params = getFetchParameters();
  const path = `${params.pathPrefix}/media`.replaceAll("//", "/");
  return `${params.origin}${path}?filepath=${encodeURIComponent(filepath)}`;
}

export const buildExecutionParams = (
  input: BuildExecutionParamsInput
): Record<string, unknown> => {
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

  const query = queryType === QUERY_TEXT ? textQuery.trim() : queryIds;

  const params: Record<string, unknown> = {
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

  if (input.dynamicResults) {
    params.dynamic_results = true;
  }

  return params;
};
