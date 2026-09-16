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
  /** Active group slice, so grouped datasets count what the grid shows. */
  readonly slice?: string;
  /** Dynamic-group views select whole groups when set. */
  readonly expand?: "dynamic-groups";
}

/** Exact scope counts, plus details for the parents named in `episodeIds`. */
export interface SelectionResult {
  readonly unavailableGroups?: readonly EpisodeSelection[];
  readonly groups: readonly EpisodeSelection[];
  readonly counts: SelectionCounts;
}

/** Count the scope and describe only the requested parents, never every member. */
export async function resolveSelection(
  datasetId: string,
  request: SelectionRequest & { readonly episodeIds?: readonly string[] },
  signal?: AbortSignal,
): Promise<SelectionResult> {
  const response = await getFetchFunctionExtended()<
    typeof request,
    SelectionResult
  >({
    method: "POST",
    path: `/dataset/${encodeURIComponent(datasetId)}/selection`,
    body: request,
    signal,
  });
  return response.response;
}

/** A frozen server-side copy of the complete scope for one bulk action. */
export interface SelectionSnapshot {
  readonly snapshotId: string;
  readonly counts: SelectionCounts;
}

/** Resolve all results once on the server; later browsing cannot move them. */
export async function createSelectionSnapshot(
  datasetId: string,
  request: SelectionRequest,
  signal?: AbortSignal,
): Promise<SelectionSnapshot> {
  const response = await getFetchFunctionExtended()<
    SelectionRequest,
    SelectionSnapshot
  >({
    method: "POST",
    path: `/dataset/${encodeURIComponent(datasetId)}/selection/snapshots`,
    body: request,
    signal,
  });
  return response.response;
}

/** What an action targets: captured members, or a snapshot of all results. */
export type SelectionScope =
  | {
      readonly kind: "members";
      readonly members: readonly SelectionMember[];
    }
  | {
      readonly kind: "snapshot";
      readonly snapshotId: string;
      readonly counts: SelectionCounts;
    };

/** Request fields naming a scope for the tag and subset routes. */
export function scopeBody(scope: SelectionScope) {
  return scope.kind === "members"
    ? { members: scope.members }
    : { snapshotId: scope.snapshotId };
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
  readonly description?: string | null;
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
  method?: "GET" | "POST" | "DELETE",
): Promise<T> {
  return (
    await getFetchFunctionExtended()<unknown, T>({
      method: method ?? (body === undefined ? "GET" : "POST"),
      path: `/dataset/${encodeURIComponent(datasetId)}/subsets${path}`,
      body,
    })
  ).response;
}

/** Deletes a saved subset; its members' media and annotations are untouched. */
export function deleteSubset(datasetId: string, subsetId: string) {
  return subsetRequest<{ id: string }>(
    datasetId,
    `/${encodeURIComponent(subsetId)}`,
    undefined,
    "DELETE",
  );
}

/** Refresh live metadata for captured parents, including those outside results. */
export async function getSelectionAvailability(
  datasetId: string,
  episodeIds: readonly string[],
  signal: AbortSignal,
  view?: readonly unknown[],
) {
  return (
    await getFetchFunctionExtended()<
      unknown,
      Record<
        string,
        Pick<
          EpisodeSelection,
          | "filepath"
          | "previewStart"
          | "unavailable"
          | "groupId"
          | "node"
          | "aspectRatio"
        >
      >
    >({
      method: "POST",
      path: `/dataset/${encodeURIComponent(datasetId)}/selection/availability`,
      body: { episodeIds, view },
      signal,
    })
  ).response;
}

export interface SelectionTagOptions {
  readonly change?: { tag: string; add: boolean };
  readonly target?: "members" | "labels";
  /** The serialized view the scope was captured in. */
  readonly view?: readonly unknown[];
  /** Grouped datasets: tag only the captured slice samples, or every slice. */
  readonly groups?: "slice" | "all";
}

/** Inspect or apply an idempotent tag change to a frozen scope. */
export async function selectionTagsRequest(
  datasetId: string,
  scope: SelectionScope,
  options: SelectionTagOptions = {},
) {
  return (
    await getFetchFunctionExtended()<
      unknown,
      {
        counts: SelectionCounts;
        tags: string[];
        labels: number | null;
        /** How many scope targets carry each tag right now. */
        applied: Record<string, number>;
        /** How many targets the scope has: samples, streams, or labels. */
        targets: number;
      }
    >({
      method: "POST",
      path: `/dataset/${encodeURIComponent(datasetId)}/selection/tags`,
      body: {
        ...scopeBody(scope),
        change: options.change,
        target: options.target ?? "members",
        view: options.view,
        groups: options.groups,
      },
    })
  ).response;
}
