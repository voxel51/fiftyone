import { getFetchFunctionExtended } from "@fiftyone/utilities";
import type {
  EpisodeSelection,
  SelectionBoundary,
  SelectionCounts,
} from "./types";

/** Serializable scope resolved independently of grid pagination. */
export interface SelectionRequest {
  readonly view: readonly unknown[];
  readonly filters: Readonly<Record<string, unknown>>;
  readonly extendedStages: Readonly<Record<string, unknown>>;
  readonly boundary: SelectionBoundary;
  readonly sortBy?: string;
  readonly desc?: boolean;
}

/** Complete, grouped result membership. */
export interface SelectionResult {
  readonly groups: readonly EpisodeSelection[];
  readonly counts: SelectionCounts;
}

/** Resolve every result in the current scope, with no loaded-card limit. */
export async function resolveSelection(
  datasetId: string,
  request: SelectionRequest,
  signal?: AbortSignal,
): Promise<SelectionResult> {
  const response = await getFetchFunctionExtended()<
    SelectionRequest,
    SelectionResult
  >({
    method: "POST",
    path: `/dataset/${encodeURIComponent(datasetId)}/selection`,
    body: request,
    signal,
  });
  return response.response;
}

/** Discover concrete built-in provider choices without selecting them. */
export async function getSelectionProviders(datasetId: string) {
  const response = await getFetchFunctionExtended()<
    undefined,
    { eventFields: string[]; temporalTags: string[] }
  >({
    method: "GET",
    path: `/dataset/${encodeURIComponent(datasetId)}/selection`,
  });
  return response.response;
}
