/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  FetchFunctionConfig,
  FetchFunctionResult,
  getFetchFunctionExtended,
} from "@fiftyone/utilities";

/** Shared request fields — every video-labels read targets one video sample. */
type VideoLabelsRequestBase = {
  /** Sample id for the parent video document. */
  sampleId: string;
  /** Current dataset name. */
  dataset: string;
  /** Active view stages, sent opaquely like every dataset query. */
  view: unknown[];
  /** Per-frame label fields to read (frame-relative, e.g. `"detections"`). */
  fields: string[];
  /** Optional extended view stages. */
  extended?: unknown;
};

export type GetVideoLabelsIndexRequest = VideoLabelsRequestBase & {
  /**
   * Declared-dynamic attribute names to value-segment per instance. Omitted →
   * the index returns presence + keyframes only (no `attributeSegments`).
   */
  dynamicAttributes?: string[];
};

export type GetVideoLabelsWindowRequest = VideoLabelsRequestBase & {
  /** First frame of the window (1-indexed, inclusive). */
  startFrame: number;
  /** Last frame of the window (1-indexed, inclusive). */
  endFrame: number;
};

/**
 * One tracked instance's presence distribution across the whole clip. Frame
 * numbers only — no label payloads. `segments` are run-length-encoded
 * `[startFrame, endFrame]` presence runs; `keyframes` is empty for data with
 * no `keyframe` attribute.
 */
export type VideoLabelIndexInstance = {
  /** Engine track id — `instance._id`, or the per-frame doc `_id` for legacy. */
  instanceId: string;
  classLabel: string | null;
  /** The detection's persisted track `index`, when present. */
  persistedIndex: number | null;
  instance: { _cls: "Instance"; _id?: string } | null;
  segments: Array<[number, number]>;
  keyframes: number[];
  /**
   * Per declared-dynamic attribute, run-length-encoded `[startFrame, endFrame,
   * value]` value runs across the instance's presence. Present only when the
   * request named `dynamicAttributes`; a frame missing the attribute yields a
   * `null`-valued run.
   */
  attributeSegments?: Record<string, Array<[number, number, unknown]>>;
};

export type GetVideoLabelsIndexResponse = {
  [field: string]: { instances: VideoLabelIndexInstance[] };
};

export type GetVideoLabelsWindowResponse = {
  /** Field-projected label payloads keyed by stringified frame number. */
  frames: Record<string, Record<string, unknown>>;
  /** Server-clamped `[startFrame, endFrame]` of the returned window. */
  range: [number, number];
};

const doFetch = <A, R>(
  config: FetchFunctionConfig<A>
): Promise<FetchFunctionResult<R>> => {
  return getFetchFunctionExtended()(config);
};

/**
 * Fetch the timeline distribution index for a video sample — per-instance
 * presence segments + keyframes, no label payloads. Cheap (projection-only
 * server aggregation); call once on surface mount and on view change. Drives
 * the timeline tracks; the playback stream fetches payloads separately via
 * {@link getVideoLabelsWindow}.
 */
export const getVideoLabelsIndex = async (
  request: GetVideoLabelsIndexRequest
): Promise<GetVideoLabelsIndexResponse> => {
  const { response } = await doFetch<
    GetVideoLabelsIndexRequest,
    GetVideoLabelsIndexResponse
  >({
    method: "POST",
    path: "/video-labels/index",
    body: request,
    result: "json",
    retries: 2,
  });

  return response;
};

/**
 * Fetch full, field-projected label payloads for a bounded frame range — the
 * playback stream's windowed read (the resident set). Returns a frame-keyed
 * map; frames carry only the requested fields they actually have.
 */
export const getVideoLabelsWindow = async (
  request: GetVideoLabelsWindowRequest
): Promise<GetVideoLabelsWindowResponse> => {
  const { response } = await doFetch<
    GetVideoLabelsWindowRequest,
    GetVideoLabelsWindowResponse
  >({
    method: "POST",
    path: "/video-labels/window",
    body: request,
    result: "json",
    retries: 2,
  });

  return response;
};
