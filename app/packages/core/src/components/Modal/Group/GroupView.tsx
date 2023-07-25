import { useTheme } from "@fiftyone/components";
import { VideoLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { groupId, useBrowserStorage } from "@fiftyone/state";
import { Resizable } from "re-resizable";
import React, { useRef } from "react";
import { useRecoilValue } from "recoil";
import { GroupBar } from "../Bars";
import EnsureGroupSample from "./EnsureGroupSample";
import { groupContainer, mainGroup } from "./Group.module.css";
import { GroupCarousel } from "./GroupCarousel";
import { GroupImageVideoSample } from "./GroupImageVideoSample";
import { GroupSample3d } from "./GroupSample3d";

const DEFAULT_SPLIT_VIEW_LEFT_WIDTH = "800";

export const GroupView = () => {
  const lookerRef = useRef<VideoLooker>();
  const theme = useTheme();
  const key = useRecoilValue(groupId);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const isCarouselVisible = useRecoilValue(
    fos.groupMediaIsCarouselVisibleSetting
  );

  const isSlotVisible = useRecoilValue(fos.groupMediaIsSlotVisible);
  const isMainVisibleSetting = useRecoilValue(
    fos.groupMediaIsMainVisibleSetting
  );
  const isMain3d = useRecoilValue(fos.isMain3d);

  const [width, setWidth] = useBrowserStorage(
    "group-modal-split-view-width",
    DEFAULT_SPLIT_VIEW_LEFT_WIDTH
  );

  return (
    <div className={groupContainer} data-cy="group-container">
      <GroupBar lookerRef={lookerRef} />
      <div className={mainGroup}>
        {(isCarouselVisible || isMainVisibleSetting) && (
          <Resizable
            size={{
              height: "100% !important",
              width: isSlotVisible ? width : "100%",
            }}
            minWidth={300}
            maxWidth={isSlotVisible ? "90%" : "100%"}
            enable={{
              top: false,
              right: isSlotVisible ? true : false,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            onResizeStop={(_, __, ___, { width: delta }) => {
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
                fullHeight={!isMainVisibleSetting && !isSlotVisible}
              />
            )}
            {
              <EnsureGroupSample>
                {isMainVisibleSetting ? (
                  isMain3d ? (
                    <GroupSample3d />
                  ) : (
                    <GroupImageVideoSample lookerRef={lookerRef} />
                  )
                ) : null}
              </EnsureGroupSample>
            }
          </Resizable>
        )}
        {isSlotVisible && <GroupSample3d />}
      </div>
    </div>
  );
};
