import { Loading } from "@fiftyone/components";
import { GroupSampleNotFound, groupSlice, modalSample } from "@fiftyone/state";
import React, { Suspense, useEffect } from "react";
import { useRecoilCallback, useRecoilValueLoadable } from "recoil";

export default ({ children }: React.PropsWithChildren<{}>) => {
  const modal = useRecoilValueLoadable(modalSample);
  const resetGroupSlice = useRecoilCallback(
    ({ set, snapshot }) =>
      async () => {
        snapshot.getPromise(groupSlice(false)).then((slice) => {
          set(groupSlice(true), slice);
        });
      },
    []
  );

  useEffect(() => {
    modal.state === "hasError" &&
      modal.contents instanceof GroupSampleNotFound &&
      resetGroupSlice();
  }, [modal, resetGroupSlice]);

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
