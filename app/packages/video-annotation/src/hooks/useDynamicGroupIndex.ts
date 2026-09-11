import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  type GetFramesRequest,
  getFrames,
} from "../../../core/src/client/framesClient";
import { type DateTime, parseTimestamp } from "../../../core/src/client/util";

/** Ordered member ids (position i ↔ frame i+1) and the group version token the next write validates against. */
export interface GroupWriteState {
  index: string[];
  token: string | null;
}

/**
 * Build the `<max ISO>|<count>` group token the server validates from the
 * members' `last_modified_at` values. The trailing `Z` is stripped like
 * {@link getSampleVersionToken} does for the sample token.
 */
export const toGroupToken = (timestamps: Date[]): string | null => {
  if (timestamps.length === 0) {
    return null;
  }

  const max = timestamps.reduce(
    (acc, ts) => Math.max(acc, ts.getTime()),
    Number.NEGATIVE_INFINITY,
  );
  const iso = new Date(max).toISOString().replace(/Z$/, "");
  return `${iso}|${timestamps.length}`;
};

export interface DynamicGroupIndex {
  /** Resolves once the in-flight index fetch settles; immediately when none is in flight. */
  whenReady: () => Promise<void>;
  /** The current write state, `null` until the index fetch lands or after it was dropped. */
  getState: () => GroupWriteState | null;
  /** Record the token a successful write returned; `null` drops the state so the next write refetches. */
  commit: (token: string | null) => void;
  /** Replace the member index and token, e.g. from a version-mismatch response. */
  replace: (index: string[], token: string | null) => void;
  /** Fetch the member index and token again, e.g. after a failed mount fetch. */
  loadIndex: () => Promise<void>;
}

export interface DynamicGroupIndexInput {
  active: boolean;
  sampleId: string;
  dataset: string;
  view: GetFramesRequest["view"];
  slice: GetFramesRequest["slice"];
  dynamicGroup: GetFramesRequest["dynamicGroup"];
  frameCount: number | null;
}

/**
 * Load a dynamic group's ordered member index and initial version token from
 * one whole-group `/frames` fetch while `active`.
 */
export const useDynamicGroupIndex = ({
  active,
  sampleId,
  dataset,
  view,
  slice,
  dynamicGroup,
  frameCount,
}: DynamicGroupIndexInput): DynamicGroupIndex => {
  const stateRef = useRef<GroupWriteState | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  // bumped on each (re)mount so a stale fetch cannot land its state
  const generation = useRef(0);

  const loadIndex = useCallback((): Promise<void> => {
    const requested = generation.current;

    const request = getFrames({
      sampleId,
      dataset,
      view,
      slice,
      dynamicGroup,
      frameNumber: 1,
      numFrames: frameCount,
      frameCount,
      // `_id` rides along with any projection
      fields: ["last_modified_at"],
    })
      .then((response) => {
        if (requested !== generation.current) {
          return;
        }

        // served in group order: the i-th document is the member behind frame i + 1
        const frames = response.frames;

        stateRef.current = {
          index: frames.map((frame) => String(frame._id)),
          token: toGroupToken(
            frames.map(
              (frame) =>
                parseTimestamp(frame.last_modified_at as DateTime) as Date,
            ),
          ),
        };
      })
      .catch((err) => {
        console.error("failed to load dynamic group member index", err);
      });

    readyRef.current = request;
    return request;
  }, [sampleId, dataset, view, slice, dynamicGroup, frameCount]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    generation.current += 1;
    stateRef.current = null;
    void loadIndex();

    return () => {
      generation.current += 1;
      stateRef.current = null;
      readyRef.current = null;
    };
  }, [active, loadIndex]);

  return useMemo(
    () => ({
      whenReady: () => readyRef.current ?? Promise.resolve(),
      getState: () => stateRef.current,
      commit: (token) => {
        const current = stateRef.current;
        stateRef.current =
          token && current ? { index: current.index, token } : null;
      },
      replace: (index, token) => {
        stateRef.current = { index, token };
      },
      loadIndex,
    }),
    [loadIndex],
  );
};
