import { getFetchFunctionExtended } from "@fiftyone/utilities";
import type {
  EpisodeSelection,
  SelectionBoundary,
  SelectionCounts,
  SelectionMember,
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
  readonly unavailableGroups?: readonly EpisodeSelection[];
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

/** A saved subset contains references to live parent episodes. */
export interface SavedSubset {
  readonly id: string;
  readonly name: string;
  readonly counts: SelectionCounts;
}

/** Preview and completion use the same units and immutable operation identity. */
export interface SubsetAddResult {
  readonly operationId: string;
  readonly subsetId: string;
  readonly counts: SelectionCounts;
  readonly added: number;
  readonly duplicates: number;
  readonly provenanceUpdated: number;
}

/** Dataset-scoped persistence client; retries reuse an already captured operation. */
export async function subsetRequest<T>(
  datasetId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return (
    await getFetchFunctionExtended()<unknown, T>({
      method: body === undefined ? "GET" : "POST",
      path: `/dataset/${encodeURIComponent(datasetId)}/subsets${path}`,
      body,
    })
  ).response;
}

/** Refresh live metadata for captured parents, including those outside results. */
export async function getSelectionAvailability(
  datasetId: string,
  episodeIds: readonly string[],
  signal: AbortSignal,
) {
  return (
    await getFetchFunctionExtended()<
      unknown,
      Record<
        string,
        Pick<EpisodeSelection, "filepath" | "previewStart" | "unavailable">
      >
    >({
      method: "POST",
      path: `/dataset/${encodeURIComponent(datasetId)}/selection/availability`,
      body: { episodeIds },
      signal,
    })
  ).response;
}

/** Inspect or apply an idempotent tag change to fixed membership. */
export async function selectionTagsRequest(
  datasetId: string,
  members: readonly SelectionMember[],
  change?: { tag: string; add: boolean },
  target: "members" | "labels" = "members",
) {
  return (
    await getFetchFunctionExtended()<
      unknown,
      { counts: SelectionCounts; tags: string[]; labels: number | null }
    >({
      method: "POST",
      path: `/dataset/${encodeURIComponent(datasetId)}/selection/tags`,
      body: { members, change, target },
    })
  ).response;
}
