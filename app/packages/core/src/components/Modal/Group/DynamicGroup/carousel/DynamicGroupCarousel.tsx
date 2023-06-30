import { Loading, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useBrowserStorage } from "@fiftyone/state";
import { Resizable } from "re-resizable";
import React, { Suspense, useState } from "react";
import { useRecoilValue } from "recoil";
import { DynamicGroupsFlashlightWrapper } from "./DynamicGroupsFlashlightWrapper";

const MAX_CAROUSEL_HEIGHT = 600;

export const DynamicGroupCarousel = () => {
  const [height, setHeight] = useBrowserStorage(
    "dynamic-group-carousel-height",
    150
  );

  const theme = useTheme();

  const [isGroupEmpty, setIsGroupEmpty] = useState(false);

  const isImageVisible = useRecoilValue(fos.groupMediaIsImageVisible);

  if (isGroupEmpty) {
    return null;
  }

  return (
    <Resizable
      size={{ height, width: "100%" }}
      minHeight={200}
      maxHeight={MAX_CAROUSEL_HEIGHT}
      enable={{
        bottom: true,
        top: !isImageVisible,
        right: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      style={{
        zIndex: 1000,
        borderBottom: `1px solid ${theme.primary.plainBorder}`,
      }}
      onResizeStop={(e, direction, ref, { height: delta }) => {
        setHeight(Math.max(height + delta, 100));
      }}
    >
      <Suspense fallback={<Loading>Pixelating...</Loading>}>
        <DynamicGroupsFlashlightWrapper setIsGroupEmpty={setIsGroupEmpty} />
      </Suspense>
    </Resizable>
  );
};
