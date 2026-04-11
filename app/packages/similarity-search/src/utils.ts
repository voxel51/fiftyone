import { getFetchParameters } from "@fiftyone/utilities";
import {
  SimilarityRun,
  SimilaritySearchParams,
  DateFilterPreset,
  QueryType,
  SearchScope,
} from "./types";
import { DAY_MS } from "./constants";

export const formatQuery = (run: SimilarityRun): string => {
  if (run.query_type === QueryType.Text && typeof run.query === "string") {
    return run.query.length > 50
      ? run.query.substring(0, 50) + "..."
      : run.query;
  }
  if (run.query_type === QueryType.Image) {
    const count = Array.isArray(run.query) ? run.query.length : 0;
    const negCount = run.negative_query_ids?.length ?? 0;
    if (negCount > 0) {
      return `Image similarity (${count} positive, ${negCount} negative)`;
    }
    return `Image similarity (${count} ${count === 1 ? "prompt" : "prompts"})`;
  }
  if (run.query_type === QueryType.Upload) {
    const filename =
      typeof run.query === "string" ? run.query : "uploaded image";
    return `Uploaded: ${filename}`;
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
  queryIdCount: number,
  hasUploadedImage?: boolean
): boolean => {
  if (!brainKey) return false;
  if (queryType === QueryType.Text && !textQuery.trim()) return false;
  if (queryType === QueryType.Image && queryIdCount === 0) return false;
  if (queryType === QueryType.Upload && !hasUploadedImage) return false;
  return true;
};

export type UploadedImage = {
  content: string;
  name: string;
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
  uploadedImage?: UploadedImage | null;
};

export function getMediaUrl(filepath: string): string {
  const params = getFetchParameters();
  const path = `${params.pathPrefix}/media`.replaceAll("//", "/");
  return `${params.origin}${path}?filepath=${encodeURIComponent(filepath)}`;
}

/**
 * Convert a File to base64-encoded content string (without data URI prefix).
 */
export function fileToBase64(
  file: File
): Promise<{ result?: string; error?: ProgressEvent<EventTarget> }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const data = reader.result as string;
      // Strip the "data:image/...;base64," prefix
      resolve({ result: data.slice(data.indexOf(",") + 1) });
    };
    reader.onerror = (error) => resolve({ error });
  });
}

/**
 * Generate a default run name when the user doesn't provide one.
 *
 * - Text: the raw query string (rendering handles truncation/tooltip)
 * - Image: "X samples" or "X patches" (singular/plural)
 * - Upload: "X images" (singular/plural)
 */
export function buildDefaultRunName({
  queryType,
  textQuery,
  queryIds,
  negativeQueryIds,
  patchesField,
  uploadedImage,
}: {
  queryType: QueryType;
  textQuery?: string;
  queryIds?: string[];
  negativeQueryIds?: string[];
  patchesField?: string;
  uploadedImage?: UploadedImage | null;
}): string {
  if (queryType === QueryType.Text) {
    return textQuery?.trim() || "text query";
  }

  if (queryType === QueryType.Upload) {
    const count = uploadedImage ? 1 : 0;
    return `${count} ${count === 1 ? "image" : "images"}`;
  }

  // Image query
  const count = queryIds?.length ?? 0;
  const negCount = negativeQueryIds?.length ?? 0;
  const unit = patchesField ? "patch" : "sample";
  const pluralize = (n: number, u: string) =>
    `${n} ${n === 1 ? u : u + (u === "patch" ? "es" : "s")}`;

  if (negCount > 0) {
    return `${pluralize(count, unit)} positive, ${pluralize(
      negCount,
      unit
    )} negative`;
  }

  return pluralize(count, unit);
}

export const buildExecutionParams = (
  input: BuildExecutionParamsInput
): SimilaritySearchParams => {
  const {
    brainKey,
    queryType,
    textQuery,
    queryIds,
    reverse,
    patchesField,
    searchScope,
    k,
    distField,
    runName,
    negativeQueryIds,
  } = input;

  let query: string | string[];
  if (queryType === QueryType.Upload) {
    query = input.uploadedImage?.name ?? "uploaded_image";
  } else if (queryType === QueryType.Text) {
    query = textQuery.trim();
  } else {
    query = queryIds;
  }

  const params: SimilaritySearchParams = {
    brain_key: brainKey,
    query_type: queryType,
    query,
    reverse,
    search_scope: searchScope,
    patches_field: patchesField,
  };

  if (queryType === QueryType.Upload && input.uploadedImage) {
    params.query_image = input.uploadedImage;
  }

  if (k !== "") params.k = k;
  if (distField.trim()) params.dist_field = distField.trim();
  params.run_name =
    runName.trim() ||
    buildDefaultRunName({
      queryType,
      textQuery,
      queryIds,
      negativeQueryIds,
      patchesField,
      uploadedImage: input.uploadedImage,
    });

  if (negativeQueryIds.length > 0) {
    params.negative_query_ids = negativeQueryIds;
  }

  if (input.dynamicResults) {
    params.dynamic_results = true;
  }

  return params;
};
