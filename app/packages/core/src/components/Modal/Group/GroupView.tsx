import { useTheme } from "@fiftyone/components";
import { VideoLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { groupId, useBrowserStorage } from "@fiftyone/state";
import { Resizable } from "re-resizable";
import React, { useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { GroupBar } from "../Bars";
import EnsureGroupSample from "./EnsureGroupSample";
import { groupContainer, mainGroup } from "./Group.module.css";
import { GroupCarousel } from "./GroupCarousel";
import { GroupImageVideoSample } from "./GroupImageVideoSample";
import GroupSample3d from "./GroupSample3d";

const DEFAULT_SPLIT_VIEW_LEFT_WIDTH = "800";

export const GroupView = () => {
  const lookerRef = useRef<VideoLooker>();
  const theme = useTheme();
  const key = useRecoilValue(groupId);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const isCarouselVisible = useRecoilValue(fos.groupMediaIsCarouselVisible);
  const is3dVisible = useRecoilValue(fos.groupMediaIs3dVisible);
  const isMainVisible = useRecoilValue(fos.groupMediaIsMainVisible);
  const [width, setWidth] = useBrowserStorage(
    "group-modal-split-view-width",
    DEFAULT_SPLIT_VIEW_LEFT_WIDTH
  );

  const shouldRender3DBelow = useMemo(() => {
    return isCarouselVisible && is3dVisible && !isMainVisible;
  }, [is3dVisible, isCarouselVisible, isMainVisible]);

  return (
    <div className={groupContainer} data-cy="group-container">
      <GroupBar lookerRef={lookerRef} />
      <div className={mainGroup}>
        {(isCarouselVisible || isMainVisible) && (
          <Resizable
            size={{
              height: "100% !important",
              width: is3dVisible && !shouldRender3DBelow ? width : "100%",
            }}
            minWidth={300}
            maxWidth={is3dVisible && !shouldRender3DBelow ? "90%" : "100%"}
            enable={{
              top: false,
              right: is3dVisible && !shouldRender3DBelow ? true : false,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            onResizeStop={(_, __, ___, { width: delta }) =>
              setWidth(String(Number(width) + delta))
            }
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
                fullHeight={!isMainVisible}
              />
            )}
            {isMainVisible && (
              <EnsureGroupSample>
                <GroupImageVideoSample lookerRef={lookerRef} />
              </EnsureGroupSample>
            )}
            {shouldRender3DBelow && <GroupSample3d />}
          </Resizable>
        )}
        {!shouldRender3DBelow && is3dVisible && <GroupSample3d />}
      </div>
    </div>
  );
};
