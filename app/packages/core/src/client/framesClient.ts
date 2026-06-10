/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  FetchFunctionConfig,
  FetchFunctionResult,
  getFetchFunctionExtended,
} from "@fiftyone/utilities";

export type GetFramesRequest = {
  /** Sample id for the parent video document. */
  sampleId: string;
  /** Current dataset name. */
  dataset: string;
  /**
   * Active view stages — same opaque array sent on every dataset
   * query. Typed `unknown[]` because the server treats it as JSON
   * and the client doesn't introspect; callers usually pass the
   * `Stage[]` from `@fiftyone/utilities`.
   */
  view: unknown[];
  /** First frame to fetch (1-indexed, inclusive). */
  frameNumber: number;
  /** Maximum number of frames to fetch starting at `frameNumber`. */
  numFrames: number;
  /** Total frame count of the clip; used to clamp the upper end. */
  frameCount: number;
  /** Group slice name, when the dataset is grouped. */
  slice?: string | null;
  /** Optional extended view stages. */
  extended?: unknown;
};

/**
 * Per-frame document returned by `POST /frames`. The shape mirrors the
 * frame's MongoDB document — `frame_number` is always present and the
 * remaining fields depend on the dataset's frame-level schema. For
 * `to_frames(sample_frames=True)` datasets, `filepath` is also present
 * at the top level alongside any label fields.
 *
 * We don't enumerate label fields here — the server may return any
 * shape based on the dataset. Callers project into the fields they
 * care about.
 */
export type FrameDoc = {
  frame_number: number;
  filepath?: string;
  [key: string]: unknown;
};

export type GetFramesResponse = {
  frames: FrameDoc[];
  /** Server-clamped `[startFrame, endFrame]` of the returned chunk. */
  range: [number, number];
};

/**
 * `fetch` with the standard FiftyOne fetch plumbing. No specialized
 * error handling — `/frames` returns generic HTTP errors and callers
 * coalesce / retry at a higher level (see e.g. `VideoFrameLabelsStream`'s
 * inflight bookkeeping).
 */
const doFetch = <A, R>(
  config: FetchFunctionConfig<A>
): Promise<FetchFunctionResult<R>> => {
  return getFetchFunctionExtended()(config);
};

/**
 * Fetch a contiguous chunk of per-frame documents from the source
 * video sample's `frames` sub-collection.
 *
 * The server clamps `frameNumber + numFrames` against `frameCount` and
 * returns the actually-served range in `response.range`, so callers can
 * use the response to track which frames are now cached.
 *
 * This is a thin wrapper around `POST /frames` — the same endpoint
 * powers per-frame label loading (`VideoFrameLabelsStream`) and ImaVid
 * per-frame image loading (`ImaVidImageStream`). Two parallel calls
 * against the same chunk are fine; HTTP/2 multiplexes and the server
 * doesn't keep state between them. Coalescing them into a single
 * request is on the fast-follow list.
 *
 * @param request Frame-chunk request
 */
export const getFrames = async (
  request: GetFramesRequest
): Promise<GetFramesResponse> => {
  const { response } = await doFetch<GetFramesRequest, GetFramesResponse>({
    method: "POST",
    path: "/frames",
    body: request,
    result: "json",
    retries: 2,
  });

  return response;
};
