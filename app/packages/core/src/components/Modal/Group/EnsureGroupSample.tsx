import { Loading } from "@fiftyone/components";
import {
  GroupSampleNotFound,
  groupField,
  groupMediaTypesMap,
  groupSlice,
  modalSample,
  nonPcdSamples,
  pinned3d,
} from "@fiftyone/state";
import { get } from "lodash";
import React, { Suspense, useEffect } from "react";
import {
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";

export default ({ children }: React.PropsWithChildren<{}>) => {
  const modal = useRecoilValueLoadable(modalSample);
  const slice = useRecoilValue(groupSlice(true));
  const resetGroupSlice = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        let slice = await snapshot.getPromise(groupSlice(false));

        const mediaTypes = await snapshot.getPromise(groupMediaTypesMap);
        if (!slice || mediaTypes[slice] === "point_cloud") {
          const samples = await snapshot.getPromise(nonPcdSamples);
          if (!samples.length) {
            slice = null;
          } else {
            slice = get(
              samples[0].sample,
              `${await snapshot.getPromise(groupField)}.name`
            ) as unknown as string;
          }
        }

        slice === null && set(pinned3d, true);
        set(groupSlice(true), slice);
      },
    []
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
