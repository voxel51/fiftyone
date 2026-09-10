import {
  useActiveSampleId,
  useAnnotationEngine,
  usePatchSample,
} from "@fiftyone/annotation";
import type { JSONDeltas } from "@fiftyone/utilities";
import { useCallback, useEffect } from "react";
import {
  type DynamicGroupMismatchBody,
  patchDynamicGroup,
  VersionMismatchError,
} from "../../../core/src/client/annotationClient";
import {
  useDatasetId,
  useDatasetName,
  useDynamicGroupValue,
  useGroupSlice,
  useView,
} from "../state/accessors";
import { toMemberPatches } from "../utils/memberPatches";
import { useDynamicGroupIndex } from "./useDynamicGroupIndex";

/**
 * Own the write path of a dynamic group played as video: `/frames/<n>/...`
 * deltas become per-member patches written through
 * `PATCH /dataset/{id}/dynamic-group` under one group version token. Inert
 * unless `enabled` with a resolved `frameCount`.
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

  const active =
    // 0 and "" are legitimate group values; only null/undefined means none
    enabled && !!frameCount && !!sampleId && !!dataset && dynamicGroup != null;

  const group = useDynamicGroupIndex({
    active,
    sampleId,
    dataset,
    view,
    slice,
    dynamicGroup,
    frameCount,
  });

  const persist = useCallback(
    async (deltas: JSONDeltas): Promise<boolean> => {
      await group.whenReady();
      let state = group.getState();

      if (!state?.token) {
        // a persistence tick can land between the index effect's teardown and
        // its remount fetch; give the fetch one macrotask
        await new Promise((resolve) => setTimeout(resolve, 0));
        await group.whenReady();
        state = group.getState();
      }

      if (!state?.token && active) {
        // the mount fetch failed or the last token was unreadable; refetch
        await group.loadIndex();
        state = group.getState();
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

      const { patches, rest } = toMemberPatches(deltas, state.index, sampleId);

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
            // ETag is not CORS-safelisted; a cross-origin server must send
            // `Access-Control-Expose-Headers: etag`
            console.error(
              "dynamic group save succeeded but the response ETag is " +
                "unreadable; is the server exposing the ETag header to " +
                "cross-origin requests?",
            );
          }

          // an unreadable token cannot validate the next save; drop the state
          // so the next persist refetches
          group.commit(response.versionToken ?? null);
        } catch (err) {
          if (err instanceof VersionMismatchError) {
            // the 412 carries the fresh member list; the pending deltas retry
            // against it
            const body = err.responseBody as
              | DynamicGroupMismatchBody
              | undefined;

            if (body?.members) {
              group.replace(
                body.members.map((member) => member.id),
                err.versionToken ?? null,
              );
            }
          }

          // the persistence handler dispatches annotation:persistenceError
          throw err;
        }
      }

      return rest.length > 0 ? patchSelected(rest) : true;
    },
    [active, datasetId, dynamicGroup, group, sampleId, view, patchSelected],
  );

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    return engine.registerPersistenceAdapter(sampleId, persist);
  }, [active, engine, sampleId, persist]);
};
