import { useTheme } from "@fiftyone/components";
import { usePanelTitle } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { groupId, useBrowserStorage } from "@fiftyone/state";
import { Resizable } from "re-resizable";
import { useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import EnsureGroupSample from "./EnsureGroupSample";
import { groupContainer, mainGroup } from "./Group.module.css";
import { GroupCarousel } from "./GroupCarousel";
import { GroupImageVideoSample } from "./GroupImageVideoSample";
import GroupSample3d from "./GroupSample3d";
import { GroupSuspense } from "./GroupSuspense";

const DEFAULT_SPLIT_VIEW_LEFT_WIDTH = "800";

export const GroupView = () => {
  const theme = useTheme();
  const key = useRecoilValue(groupId);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));
  const is3dVisible = fos.useIs3dVisible();
  const isCarouselVisible = fos.useIsGroupCarouselVisible();
  const isMainVisible = fos.useIsGroupMain2dViewerVisible();
  const [width, setWidth] = useBrowserStorage(
    "group-modal-split-view-width",
    DEFAULT_SPLIT_VIEW_LEFT_WIDTH,
  );

  const shouldRender3DBelow = useMemo(() => {
    return isCarouselVisible && is3dVisible && !isMainVisible;
  }, [is3dVisible, isCarouselVisible, isMainVisible]);

  const activeSliceDescriptorLabel = useRecoilValue(
    fos.activeSliceDescriptorLabel,
  );
  const [_, setPanelTitle, resetPanelTitle] = usePanelTitle();
  const panelTitleHandlersRef = useRef({
    resetPanelTitle,
    setPanelTitle,
  });

  panelTitleHandlersRef.current = {
    resetPanelTitle,
    setPanelTitle,
  };

  useEffect(() => {
    const updatedTitle = `📌 ${activeSliceDescriptorLabel}`;
    panelTitleHandlersRef.current.setPanelTitle(updatedTitle);

    return () => {
      panelTitleHandlersRef.current.resetPanelTitle();
    };
  }, [activeSliceDescriptorLabel]);

  return (
    <div className={groupContainer} data-cy="group-container">
      <div className={mainGroup}>
        <EnsureGroupSample>
          {(isCarouselVisible || isMainVisible) && (
            <Resizable
              size={{
                height: "100% !important",
                width: is3dVisible && !shouldRender3DBelow ? width : "100%",
              }}
              minWidth={300}
              minHeight={"100%"}
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
                <GroupSuspense main2d>
                  <GroupImageVideoSample />
                </GroupSuspense>
              )}
              {shouldRender3DBelow && <GroupSample3d />}
            </Resizable>
          )}
          {!shouldRender3DBelow && is3dVisible && <GroupSample3d />}
        </EnsureGroupSample>
      </div>
    </div>
  );
};
