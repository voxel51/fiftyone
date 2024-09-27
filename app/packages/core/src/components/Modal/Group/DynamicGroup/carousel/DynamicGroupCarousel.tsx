import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useBrowserStorage } from "@fiftyone/state";
import { Resizable } from "re-resizable";
import React, { useEffect, useState } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { DynamicGroupsFlashlightWrapper } from "./DynamicGroupsFlashlightWrapper";

const MAX_CAROUSEL_HEIGHT = 600;

export const DynamicGroupCarousel = React.memo(() => {
  const [height, setHeight] = useBrowserStorage(
    "dynamic-group-carousel-height",
    150
  );

  const theme = useTheme();
  const isMainVisible = useRecoilValue(fos.groupMediaIsMainVisibleSetting);

  /**
   * BIG HACK: TODO: FIX ME
   *
   * Problem = flashlight is not re-rendering when group by field changes.
   * Solution was to key it by groupByValue, but when the component
   * subscribes to the groupByFieldValue using useRecoilValue(fos.groupByFieldValue),
   * while it solves the problem,it causes flashlight to behave weirdly.
   * (try scrolling carousel and selecting samples, flashlight will reset to the front)
   *
   */
  const getGroupByFieldValue = useRecoilCallback(({ snapshot }) => () => {
    const groupByField = snapshot.getLoadable(fos.groupByFieldValue).getValue();
    return groupByField;
  });

  const [groupByValue, setGroupByValue] = useState(getGroupByFieldValue());
  const groupByValueRef = React.useRef(groupByValue);
  groupByValueRef.current = groupByValue;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const groupByFieldValue = getGroupByFieldValue();
      if (groupByFieldValue !== groupByValueRef.current) {
        setGroupByValue(groupByFieldValue);
      }
    }, 50);

    return () => window.clearInterval(intervalId);
  }, []);

  console.log("Group by value is ", groupByValueRef.current);
  return (
    <Resizable
      size={{ height, width: "100%" }}
      minHeight={200}
      maxHeight={MAX_CAROUSEL_HEIGHT}
      enable={{
        bottom: true,
        top: !isMainVisible,
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
      <DynamicGroupsFlashlightWrapper key={groupByValue} />
    </Resizable>
  );
});
