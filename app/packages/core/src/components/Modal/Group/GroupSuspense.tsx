import { Loading } from "@fiftyone/components";
import React, { PropsWithChildren, Suspense } from "react";

export const GroupSuspense: React.FC<PropsWithChildren<{}>> = ({
  children,
}) => {
  return (
    <Suspense fallback={<Loading>Pixelating...</Loading>}>{children}</Suspense>
  );
};
