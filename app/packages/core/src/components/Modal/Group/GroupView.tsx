import { groupContainer, mainGroup } from "../Modal.module.css";

import * as fos from "@fiftyone/state";
import { groupId, useBrowserStorage } from "@fiftyone/state";
import React, { useEffect, useMemo, useRef } from "react";

import { useTheme } from "@fiftyone/components";
import { VideoLooker } from "@fiftyone/looker";
import { Resizable } from "re-resizable";
import { useRecoilValue } from "recoil";
import { GroupBar } from "../Bars";
import { GroupCarousel } from "./GroupCarousel";
import { GroupImageVideoSample } from "./GroupImageVideoSample";
import { GroupSample3d } from "./GroupSample3d";
import { GroupSuspense } from "./GroupSuspense";

const DEFAULT_SPLIT_VIEW_LEFT_WIDTH = "800";

export const GroupView: React.FC<{ lookerRefCallback?: (looker) => void }> = ({
  lookerRefCallback,
}) => {
  const lookerRef = useRef<VideoLooker>();
  const theme = useTheme();
  const key = useRecoilValue(groupId);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const isCarouselVisible = useRecoilValue(fos.groupMediaIsCarouselVisible);

  const pointCloudSliceExists = useRecoilValue(fos.pointCloudSliceExists);
  const is3DVisible =
    useRecoilValue(fos.groupMediaIs3DVisible) && pointCloudSliceExists;
  const isImageVisible = useRecoilValue(fos.groupMediaIsImageVisible);

  const shouldSplitVertically = useMemo(
    () => is3DVisible && isImageVisible,
    [is3DVisible, isImageVisible]
  );

  const [width, setWidth] = useBrowserStorage(
    "group-modal-split-view-width",
    shouldSplitVertically ? DEFAULT_SPLIT_VIEW_LEFT_WIDTH : "100%"
  );

  useEffect(() => {
    if (!shouldSplitVertically) {
      setWidth("100%");
    }
  }, [shouldSplitVertically, setWidth]);

  return (
    <div className={groupContainer} data-cy="group-container">
      <GroupBar lookerRef={lookerRef} />
      <div className={mainGroup}>
        {(isCarouselVisible || isImageVisible) && (
          <Resizable
            size={{ height: "100% !important", width }}
            minWidth={300}
            maxWidth={shouldSplitVertically ? "90%" : "100%"}
            enable={{
              top: false,
              right: shouldSplitVertically ? true : false,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            onResizeStop={(e, direction, ref, { width: delta }) => {
              if (width === "100%") {
                setWidth(DEFAULT_SPLIT_VIEW_LEFT_WIDTH);
              } else {
                setWidth(String(Number(width) + delta));
              }
            }}
            style={{
              position: "relative",
              borderRight: `1px solid ${theme.primary.plainBorder}`,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            {isCarouselVisible && (
              <GroupCarousel
                key={`${key}-${mediaField}`}
                fullHeight={!is3DVisible && !isImageVisible}
              />
            )}

            {isImageVisible ? (
              <GroupSuspense>
                <GroupImageVideoSample
                  lookerRef={lookerRef}
                  lookerRefCallback={lookerRefCallback}
                />
              </GroupSuspense>
            ) : is3DVisible ? (
              <GroupSample3d />
            ) : null}
          </Resizable>
        )}

        {shouldSplitVertically && <GroupSample3d />}

        {!shouldSplitVertically && is3DVisible && <GroupSample3d />}
      </div>
    </div>
  );
};
