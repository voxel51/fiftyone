/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Slice-state guard for the modal's group sample. Runs two effects:
 *
 * 1. If the active slice is 3D, swap to the first non-3D slice and pin the
 *    3D viewer (keeps the carousel non-3D-only).
 * 2. If the underlying sample failed to load with `GroupSampleNotFound`
 *    (sparse groups), reset to a slice that has a sample.
 *
 * Rendering of the loading / empty-slice placeholders is handled separately
 * by `GroupSuspense`; this component is purely about slice state. Children
 * are passed through directly — wrap the consumer site in `GroupSuspense`
 * for the loading, "No sample", and GroupSampleNotFound short-circuits.
 */

import {
  GroupSampleNotFound,
  groupField,
  groupMediaTypes,
  groupMediaTypesMap,
  groupSlice,
  modalGroupSlice,
  modalSample,
  non3dSamples,
  useRenderConfig3dActions,
} from "@fiftyone/state";
import { is3d } from "@fiftyone/utilities";
import { get } from "lodash";
import React, { useEffect } from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";

type SliceMediaType = { name: string; mediaType: string };

/**
 * Returns the first non-3D slice name from the dataset's slice definitions,
 * or `undefined` if every slice is 3D (or none are defined).
 */
const pickNon3dSlice = (
  slices: readonly SliceMediaType[]
): string | undefined =>
  slices
    .filter(({ mediaType }) => !is3d(mediaType))
    .map(({ name }) => name)
    .sort()[0];

const EnsureGroupSample = ({ children }: React.PropsWithChildren) => {
  const actions = useRenderConfig3dActions();
  const modal = useRecoilValueLoadable(modalSample);
  const mediaTypes = useRecoilValue(groupMediaTypes);
  const mediaTypesMap = useRecoilValue(groupMediaTypesMap);
  const [slice, setSlice] = useRecoilState(modalGroupSlice);

  // If the currently selected modal slice is 3D, swap to the first non-3D
  // slice (and pin 3D rendering). Keeps the carousel non-3D-only.
  useEffect(() => {
    if (!slice || !is3d(mediaTypesMap[slice])) return;
    const fallback = pickNon3dSlice(mediaTypes);
    actions.setPinned(true);
    setSlice(fallback ?? null);
  }, [actions, slice, mediaTypes, mediaTypesMap, setSlice]);

  // If the modal sample couldn't be loaded for the current slice (sparse
  // groups), reset to a slice that actually has a sample.
  const resetSlice = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        let next = await snapshot.getPromise(groupSlice);
        const map = await snapshot.getPromise(groupMediaTypesMap);

        if (!next || is3d(map[next])) {
          const samples = await snapshot.getPromise(non3dSamples);
          if (!samples.length) {
            next = null;
          } else {
            const field = await snapshot.getPromise(groupField);
            const resolved = get(samples[0].sample, `${field}.name`);
            next = typeof resolved === "string" ? resolved : null;
          }
        }

        if (next === null) {
          actions.setPinned(true);
        }

        set(modalGroupSlice, next);
      },
    [actions]
  );

  useEffect(() => {
    if (
      modal.state === "hasError" &&
      modal.contents instanceof GroupSampleNotFound
    ) {
      resetSlice();
    }
  }, [modal, resetSlice]);

  return <>{children}</>;
};

export default EnsureGroupSample;
