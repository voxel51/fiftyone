import {
  useActiveSampleId,
  useAnnotationEngine,
  usePatchSample,
} from "@fiftyone/annotation";
import type { JSONDeltas } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef } from "react";
import {
  type DynamicGroupMemberPatch,
  type DynamicGroupMismatchBody,
  patchDynamicGroup,
  VersionMismatchError,
} from "../../../core/src/client/annotationClient";
import { getFrames } from "../../../core/src/client/framesClient";
import { parseTimestamp } from "../../../core/src/client/util";
import {
  useDatasetId,
  useDatasetName,
  useDynamicGroupValue,
  useGroupSlice,
  useView,
} from "../state/accessors";
import { splitMemberDeltas } from "../utils/memberDeltas";

/**
 * The group's write-side state: the ordered member ids (position i ↔ frame
 * i+1) and the group version token the next write validates against.
 */
interface GroupWriteState {
  index: string[];
  token: string | null;
}

/**
 * Build the group token from member `last_modified_at` values — the same
 * `<max ISO>|<count>` recipe the server validates (compared as datetimes
 * with tolerance, so millisecond truncation is fine). The trailing `Z` is
 * stripped like {@link getSampleVersionToken} does for the sample token.
 */
const toGroupToken = (timestamps: (Date | null)[]): string | null => {
  let max = Number.NEGATIVE_INFINITY;
  for (const ts of timestamps) {
    // A member without `last_modified_at` cannot move the max; treating it
    // as fatal minted a null token and refused every subsequent save
    // ("dynamic group write state is not ready") for the whole session
    if (ts) {
      max = Math.max(max, ts.getTime());
    }
  }

  if (timestamps.length === 0) {
    return null;
  }

  // Legacy members never written through the app carry NO
  // `last_modified_at` — pin to the epoch, the same sentinel the server
  // computes for that state, so the first write can validate at all (a
  // null token here deadlocks: no save is ever attempted, and only a save
  // could stamp real timestamps)
  if (!Number.isFinite(max)) {
    max = 0;
  }

  const iso = new Date(max).toISOString().replace(/Z$/, "");
  return `${iso}|${timestamps.length}`;
};

/**
 * Own the write path of a dynamic group played as video.
 *
 * The composite video store keys itself to the modal sample and emits
 * `/frames/<n>/...` deltas, but each ImaVid "frame" is its own top-level
 * image sample — so this hook registers a persistence adapter for the store
 * that translates frame ops to per-member patches and writes them through
 * `PATCH /dataset/{id}/dynamic-group` under ONE group version token (the
 * group, not each member, is the concurrency container). Ops outside
 * `/frames` fall through to the standard modal-sample PATCH.
 *
 * The frame → member-sample index comes from one whole-group `/frames`
 * fetch at mount (ids + `last_modified_at`, which also mints the initial
 * token). On a version conflict the 412 body carries the fresh member list,
 * so the state rebuilds without a refetch and the error propagates like the
 * single-sample transport's — the next persistence pass retries against the
 * refreshed token.
 *
 * Inert unless `enabled` (the surface is an image dynamic group) with a
 * resolved `frameCount`.
 */
export const useDynamicGroupPersistence = ({
  enabled,
  frameCount,
}: {
  enabled: boolean;
  frameCount: number | null;
}): void => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const datasetId = useDatasetId();
  const dataset = useDatasetName();
  const view = useView();
  const slice = useGroupSlice();
  const dynamicGroup = useDynamicGroupValue();
  const patchSelected = usePatchSample();

  const stateRef = useRef<GroupWriteState | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);

  const active =
    // `dynamicGroup` is the group's VALUE — 0 and "" are legitimate groups,
    // so only null/undefined means "not a dynamic group"
    enabled && !!frameCount && !!sampleId && !!dataset && dynamicGroup != null;

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let cancelled = false;
    stateRef.current = null;

    readyRef.current = getFrames({
      sampleId,
      dataset,
      view,
      slice,
      dynamicGroup,
      frameNumber: 1,
      numFrames: frameCount,
      frameCount,
      // ids ride along (Mongo projections keep `_id`); `last_modified_at`
      // mints the initial group token
      fields: ["last_modified_at"],
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        const frames = [...response.frames].sort(
          (a, b) => a.frame_number - b.frame_number,
        );

        stateRef.current = {
          index: frames.map((frame) => String(frame._id)),
          token: toGroupToken(
            frames.map((frame) =>
              parseTimestamp(
                frame.last_modified_at as Parameters<typeof parseTimestamp>[0],
              ),
            ),
          ),
        };
      })
      .catch((err) => {
        console.error("failed to load dynamic group member index", err);
      });

    return () => {
      cancelled = true;
      stateRef.current = null;
      readyRef.current = null;
    };
  }, [active, sampleId, dataset, view, slice, dynamicGroup, frameCount]);

  const persist = useCallback(
    async (deltas: JSONDeltas): Promise<boolean> => {
      await readyRef.current;
      let state = stateRef.current;

      if (!state?.token) {
        // A persistence tick can land between the index effect's teardown
        // and its next fetch (a remount); the deltas stay pending either
        // way, so give the fetch one macrotask before failing the pass
        await new Promise((resolve) => setTimeout(resolve, 0));
        await readyRef.current;
        state = stateRef.current;
      }

      if (!state?.token || !datasetId || dynamicGroup == null) {
        throw new Error(
          "dynamic group write state is not ready " +
            JSON.stringify({
              hasState: state !== null,
              memberCount: state?.index.length ?? 0,
              token: state?.token ?? null,
              datasetId: datasetId || null,
              dynamicGroup: dynamicGroup ?? null,
            }),
        );
      }

      const { byFrame, rest } = splitMemberDeltas(deltas);

      const patches: DynamicGroupMemberPatch[] = [];
      for (const [frame, ops] of byFrame) {
        const memberId = state.index[frame - 1];

        if (!memberId) {
          throw new Error(
            `dynamic group save: no member sample at frame ${frame} ` +
              `(index has ${state.index.length} members)`,
          );
        }

        patches.push({ sampleId: memberId, patch: ops });
      }

      // Sample-level ops belong to the anchor sample, which is itself a
      // group member — ride the same fan-out so the write validates against
      // the GROUP token. The single-sample transport mints its token from
      // the sample's `last_modified_at`, which legacy samples lack, and a
      // null token silently fails the whole pass.
      let restViaGroup = false;
      if (rest.length > 0 && state.index.includes(sampleId)) {
        const anchor = patches.find((patch) => patch.sampleId === sampleId);
        if (anchor) {
          anchor.patch = [...anchor.patch, ...rest];
        } else {
          patches.push({ sampleId, patch: rest });
        }
        restViaGroup = true;
      }

      if (patches.length > 0) {
        try {
          const response = await patchDynamicGroup({
            datasetId,
            dynamicGroup,
            view,
            patches,
            versionToken: state.token,
          });

          if (!response.versionToken) {
            // the write landed but the fresh token is unreadable — the ETag
            // header is not CORS-safelisted, so a cross-origin server must
            // send `Access-Control-Expose-Headers: etag` for it to be
            // visible here. Without it the next save cannot validate.
            console.error(
              "dynamic group save succeeded but the response ETag is " +
                "unreadable; is the server exposing the ETag header to " +
                "cross-origin requests?",
            );
          }

          state.token = response.versionToken;
        } catch (err) {
          if (err instanceof VersionMismatchError) {
            // the 412 carries the fresh member list — rebuild the index and
            // token so the retry (the deltas are still pending) validates
            const body = err.responseBody as
              | DynamicGroupMismatchBody
              | undefined;

            if (body?.members) {
              stateRef.current = {
                index: body.members.map((member) => member.id),
                token: err.versionToken ?? null,
              };
            }
          }

          // surface the failure like the single-sample transport does — the
          // persistence handler dispatches annotation:persistenceError
          throw err;
        }
      }

      let success = true;
      if (rest.length > 0 && !restViaGroup) {
        success = await patchSelected(rest);
      }

      return success;
    },
    [datasetId, dynamicGroup, sampleId, view, patchSelected],
  );

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    return engine.registerPersistenceAdapter(sampleId, persist);
  }, [active, engine, sampleId, persist]);
};
