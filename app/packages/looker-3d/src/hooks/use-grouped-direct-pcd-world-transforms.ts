import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useMemo, useState } from "react";
import {
  resolveDirectPcdWorldAlignment,
  WORLD_FRAME,
  type DirectPcdWorldTransforms,
} from "../fo3d/direct-pcd-world-alignment";
import type { GroupStaticTransformResponse } from "../frustum/types";

interface AlignmentState {
  readonly error: Error | null;
  readonly isLoading: boolean;
  readonly key: string | null;
  readonly transformsBySlice: DirectPcdWorldTransforms;
}

const EMPTY_RESULT = {
  error: null,
  isLoading: false,
  transformsBySlice: {},
} as const;

const EMPTY_STATE: AlignmentState = {
  ...EMPTY_RESULT,
  key: null,
};

/**
 * Resolves active grouped direct-PCD native frames into the existing world
 * target. An explicit target disables the endpoint's best-target fallback.
 */
export const useGroupedDirectPcdWorldTransforms = ({
  enabled,
  sampleId,
  sliceNames,
}: {
  enabled: boolean;
  sampleId: string | null;
  sliceNames: readonly string[];
}) => {
  const datasetId = fos.useCurrentDatasetId();
  const slicesKey = useMemo(
    () => [...sliceNames].sort().join("\0"),
    [sliceNames],
  );
  const requestKey =
    enabled && datasetId && sampleId && slicesKey
      ? `${datasetId}\0${sampleId}\0${slicesKey}`
      : null;
  const [state, setState] = useState<AlignmentState>(EMPTY_STATE);

  // This effect resolves one world transform request and ignores stale group
  // navigation responses.
  useEffect(() => {
    if (!requestKey || !datasetId || !sampleId) {
      setState(EMPTY_STATE);
      return undefined;
    }

    let cancelled = false;
    const requestedSlices = slicesKey.split("\0");
    setState({
      error: null,
      isLoading: true,
      key: requestKey,
      transformsBySlice: {},
    });

    const query = new URLSearchParams({
      slices: requestedSlices.join(","),
      target_frame: WORLD_FRAME,
    });
    const fetch = getFetchFunction({ cache: true });

    void fetch<void, GroupStaticTransformResponse>(
      "GET",
      `/dataset/${encodeURIComponent(datasetId)}/sample/${encodeURIComponent(
        sampleId,
      )}/group/static_transforms?${query.toString()}`,
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        const alignment = resolveDirectPcdWorldAlignment(
          response,
          requestedSlices,
        );
        const error = alignment.unresolvedSlices.length
          ? new Error(
              `Unable to align grouped PCD slice${
                alignment.unresolvedSlices.length === 1 ? "" : "s"
              } to world: ${alignment.unresolvedSlices.join(", ")}`,
            )
          : null;

        setState({
          error,
          isLoading: false,
          key: requestKey,
          transformsBySlice: alignment.transformsBySlice,
        });
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }

        const message =
          reason instanceof Error ? reason.message : String(reason);
        setState({
          error: new Error(
            `Failed to resolve grouped PCD world transforms: ${message}`,
          ),
          isLoading: false,
          key: requestKey,
          transformsBySlice: {},
        });
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, requestKey, sampleId, slicesKey]);

  if (!requestKey) {
    return EMPTY_RESULT;
  }

  if (state.key !== requestKey) {
    return {
      ...EMPTY_RESULT,
      isLoading: true,
    };
  }

  return {
    error: state.error,
    isLoading: state.isLoading,
    transformsBySlice: state.transformsBySlice,
  };
};
