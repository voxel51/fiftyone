import { Loading } from "@fiftyone/components";
import {
  GroupSampleNotFound,
  modalGroupSlice,
  modalSample,
} from "@fiftyone/state";
import React, { PropsWithChildren, Suspense } from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";

type Props = PropsWithChildren<{
  /**
   * Set on the main 2D viewer wrapper. When no slice is resolved, render a
   * "No sample" placeholder, and when the modal sample fails with
   * `GroupSampleNotFound`, render the "Pixelating..." placeholder. 3D and
   * dynamic-group wrappers don't depend on the 2D slice and should leave
   * this `false`.
   */
  main2d?: boolean;
}>;

export const GroupSuspense: React.FC<Props> = ({ children, main2d }) => {
  const modal = useRecoilValueLoadable(modalSample);
  const slice = useRecoilValue(modalGroupSlice);

  if (main2d && !slice) {
    return <Loading>No sample</Loading>;
  }

  // Sparse groups can legitimately have no sample for the active 2D slice.
  // Show the same "Pixelating..." placeholder the Suspense fallback would
  // render rather than letting the error propagate into 2D children. 3D
  // wrappers don't depend on `modalSample` and must not be blocked here.
  if (
    main2d &&
    modal.state === "hasError" &&
    modal.contents instanceof GroupSampleNotFound
  ) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>{children}</Suspense>
  );
};
