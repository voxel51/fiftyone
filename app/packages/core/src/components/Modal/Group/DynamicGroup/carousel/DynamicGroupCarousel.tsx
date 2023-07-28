import { useTheme } from "@fiftyone/components";
import { useBrowserStorage } from "@fiftyone/state";
import { Resizable } from "re-resizable";
import React from "react";
import { DynamicGroupsFlashlightWrapper } from "./DynamicGroupsFlashlightWrapper";

const MAX_CAROUSEL_HEIGHT = 600;

export const DynamicGroupCarousel = () => {
  const [height, setHeight] = useBrowserStorage(
    "dynamic-group-carousel-height",
    150
  );

  const theme = useTheme();

  return (
    <Resizable
      size={{ height, width: "100%" }}
      minHeight={200}
      maxHeight={MAX_CAROUSEL_HEIGHT}
      enable={{
        bottom: true,
        top: false,
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
      data-cy={"group-carousel"}
    >
      <DynamicGroupsFlashlightWrapper />
    </Resizable>
  );
};
