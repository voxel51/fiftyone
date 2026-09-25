import { getFetchFunctionExtended } from "@fiftyone/utilities";
import type { State } from "../recoil/types";
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
  readonly unavailableTotal?: number;
  readonly unavailableGroups?: readonly EpisodeSelection[];
  readonly groups: readonly EpisodeSelection[];
  readonly counts: SelectionCounts;
}

/** Count the scope and describe only the requested parents, never every member. */
export async function resolveSelection(
  datasetId: string,
  request: SelectionRequest & {
    readonly episodeIds?: readonly string[];
    readonly unavailableSkip?: number;
  },
  signal?: AbortSignal,
): Promise<SelectionResult> {
  return runSelectionJob<SelectionResult>(datasetId, "scope", request, signal);
}

/** Resolve clicked tiles promptly without queuing or recounting the whole scope. */
export async function resolveSelectionDetails(
  datasetId: string,
  request: SelectionRequest & {
    readonly episodeIds: readonly string[];
    readonly capture?: boolean;
  },
  signal?: AbortSignal,
): Promise<Pick<SelectionResult, "groups">> {
  if (request.capture && request.expand)
    return runSelectionJob<Pick<SelectionResult, "groups">>(
      datasetId,
      "capture",
      { ...request, detailsOnly: true },
      signal,
    );
  return (
    await getFetchFunctionExtended()<unknown, Pick<SelectionResult, "groups">>({
      method: "POST",
      path: `/dataset/${encodeURIComponent(datasetId)}/selection`,
      body: { ...request, detailsOnly: true },
      signal,
    })
  ).response;
}

/** Where one sample sits in the grid's paginated order. */
export interface SamplePosition {
  /** Zero-based index, or null when the scope does not show the sample. */
  readonly index: number | null;
}

/** Locate a sample in the current results without paging to it. */
export async function resolveSamplePosition(
  datasetId: string,
  request: SelectionRequest & { readonly sampleId: string },
  signal?: AbortSignal,
): Promise<SamplePosition> {
  const response = await getFetchFunctionExtended()<
    typeof request,
    SamplePosition
  >({
    method: "POST",
    path: `/dataset/${encodeURIComponent(datasetId)}/selection/position`,
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
  return runSelectionJob<SelectionSnapshot>(
    datasetId,
    "snapshot",
    request,
    signal,
  );
}

interface CaptureUnionRequest {
  readonly members: readonly SelectionMember[];
  readonly snapshotIds: readonly string[];
  readonly view: readonly unknown[];
  readonly groupCount?: number;
}

/** Count overlapping frozen captures without writing their union. */
export async function countSelectionCaptures(
  datasetId: string,
  request: CaptureUnionRequest,
  signal?: AbortSignal,
): Promise<SelectionCounts> {
  const result = await runSelectionJob<SelectionResult>(
    datasetId,
    "scope",
    request,
    signal,
  );
  return result.counts;
}

/** Freeze a union; transient grid filters keep the normal short expiry. */
export async function combineSelectionCaptures(
  datasetId: string,
  request: CaptureUnionRequest & {
    readonly groups?: "all";
    readonly transient?: boolean;
  },
  signal?: AbortSignal,
): Promise<SelectionScope & { readonly kind: "snapshot" }> {
  const result = await runSelectionJob<SelectionSnapshot>(
    datasetId,
    "snapshot",
    request,
    signal,
  );
  return { kind: "snapshot", ...result };
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
  /** An opening preference; membership can include any slice. */
  readonly preferredGroupSlice?: string | null;
  /** Saved identities, including unavailable references; independent of views. */
  readonly memberCount: number;
  readonly memberCounts: {
    readonly fullEpisodes: number;
    readonly segments: number;
  };
  /** Availability and distinct parent counts, computed only when requested. */
  readonly counts: SelectionCounts | null;
  readonly kinds?: readonly ("episode" | "segment")[];
  /** Conversion that gives saved entities their identity. */
  readonly view?: readonly State.Stage[] | null;
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

/** One page of a dataset's subsets, with how many match and how many exist. */
export interface SubsetPage {
  readonly subsets: SavedSubset[];
  readonly total: number;
  readonly count: number;
}

/** Pages the dataset's subsets, matching names and descriptions to a search. */
export function listSubsets(
  datasetId: string,
  options: {
    search?: string;
    skip?: number;
    limit?: number;
    view?: readonly unknown[];
  } = {},
) {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.skip) params.set("skip", String(options.skip));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.view !== undefined)
    params.set("view", JSON.stringify(options.view));
  const query = params.toString();
  return subsetRequest<SubsetPage>(datasetId, query ? `?${query}` : "");
}

/** Reads a subset's name and member kinds without scanning its membership. */
export function getSubset(datasetId: string, subsetId: string) {
  return subsetRequest<SavedSubset>(
    datasetId,
    `/${encodeURIComponent(subsetId)}?counts=false`,
  );
}

/** Computes exact live counts separately from the metadata needed for actions. */
export function getSubsetCounts(
  datasetId: string,
  subsetId: string,
  signal?: AbortSignal,
) {
  return runSelectionJob<SavedSubset>(
    datasetId,
    "summary",
    { subsetId },
    signal,
  );
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

/** Removes exact references from a subset without deleting their samples. */
export function removeSubsetMembers(
  datasetId: string,
  subsetId: string,
  scope: SelectionScope,
) {
  return subsetRequest<{
    subsetId: string;
    removed: number;
    counts: SelectionCounts | null;
  }>(datasetId, `/${encodeURIComponent(subsetId)}/remove`, scopeBody(scope));
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
          | "crop"
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
        disabledReason?: string;
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
      },
    })
  ).response;
}

/** Persisted server work; totals are unknown until capture finishes. */
export interface SelectionJob<T = unknown> {
  readonly id: string;
  readonly kind: "snapshot" | "capture" | "add" | "scope" | "summary";
  readonly state: "requested" | "running" | "completed" | "failed" | "canceled";
  readonly cancelRequested: boolean;
  readonly progress: {
    readonly phase: string;
    readonly done: number;
    readonly total: number | null;
    readonly added?: number;
    readonly duplicates?: number;
  } | null;
  readonly result: T | null;
  readonly error: string | null;
}

/** Reads or updates a dataset-scoped operation handle. */
export async function selectionJobRequest<T>(
  datasetId: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<SelectionJob<T>> {
  return (
    await getFetchFunctionExtended()<unknown, SelectionJob<T>>({
      method: body === undefined ? "GET" : "POST",
      path: `/dataset/${encodeURIComponent(datasetId)}/selection/jobs${path}`,
      body,
      signal,
    })
  ).response;
}

/** Submits work with a stable ID so a lost response can be recovered. */
export function startSelectionJob<T>(
  datasetId: string,
  kind: SelectionJob["kind"],
  request: unknown,
  id = crypto.randomUUID(),
) {
  return selectionJobRequest<T>(datasetId, "", { id, kind, request });
}

/** Poll reads without holding an HTTP request open through a large scan. */
async function runSelectionJob<T>(
  datasetId: string,
  kind: SelectionJob["kind"],
  request: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const id = crypto.randomUUID();
  const cancel = () => {
    void selectionJobRequest(datasetId, `/${id}`, { action: "cancel" }).catch(
      () => {},
    );
  };
  signal?.throwIfAborted();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    let job = await startSelectionJob<T>(datasetId, kind, request, id);
    let delay = 100;
    while (job.state === "requested" || job.state === "running") {
      signal?.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      signal?.throwIfAborted();
      job = await selectionJobRequest<T>(
        datasetId,
        `/${id}`,
        undefined,
        signal,
      );
      delay = Math.min(delay * 2, 2000);
    }
    if (job.state !== "completed" || job.result === null) {
      throw new Error(job.error ?? "The operation was stopped");
    }
    return job.result;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
