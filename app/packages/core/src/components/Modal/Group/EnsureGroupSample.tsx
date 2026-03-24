import { Loading } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  GroupSampleNotFound,
  groupField,
  groupMediaTypesMap,
  groupSlice,
  modalGroupSlice,
  modalSample,
  non3dSamples,
} from "@fiftyone/state";
import { get } from "lodash";
import React, { Suspense, useEffect } from "react";
import {
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { is3d } from "@fiftyone/utilities";

export default ({
  children,
}: React.PropsWithChildren<Record<string, never>>) => {
  const actions = fos.useRenderConfig3dActions();
  const modal = useRecoilValueLoadable(modalSample);
  const slice = useRecoilValue(modalGroupSlice);
  const resetGroupSlice = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        let slice = await snapshot.getPromise(groupSlice);

        const mediaTypes = await snapshot.getPromise(groupMediaTypesMap);
        if (!slice || is3d(mediaTypes[slice])) {
          const samples = await snapshot.getPromise(non3dSamples);
          if (!samples.length) {
            slice = null;
          } else {
            slice = get(
              samples[0].sample,
              `${await snapshot.getPromise(groupField)}.name`
            ) as unknown as string;
          }
        }

        slice === null && actions.setPinned(true);
        set(modalGroupSlice, slice);
      },
    [actions]
  );

  useEffect(() => {
    modal.state === "hasError" &&
      modal.contents instanceof GroupSampleNotFound &&
      resetGroupSlice();
  }, [modal, resetGroupSlice]);

  if (!slice) {
    return <Loading>No data</Loading>;
  }

  if (
    modal.state === "hasError" &&
    modal.contents instanceof GroupSampleNotFound
  ) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>{children}</Suspense>
  );
};
