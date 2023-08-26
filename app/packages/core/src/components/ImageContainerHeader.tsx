import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { groupStatistics, isGroup as isGroupAtom } from "@fiftyone/state";
import { Apps } from "@mui/icons-material";
import Color from "color";
import React, { Suspense, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import LoadingDots from "../../../components/src/components/Loading/LoadingDots";
import { GridActionsRow } from "./Actions";
import { Slider } from "./Common/RangeSlider";
import { gridZoom, gridZoomRange } from "./Grid";
import GroupSliceSelector from "./GroupSliceSelector";
import ResourceCount from "./ResourceCount";

export const SamplesHeader = styled.div`
  position: absolute;
  top: 0;
  display: flex;
  padding: 0.5rem;
  justify-content: space-between;
  overflow: visible;
  width: 100%;
  background-image: linear-gradient(
    to top,
    ${({ theme }) => Color(theme.background.mediaSpace).alpha(0.0).toString()}
      0%,
    ${({ theme }) => theme.background.mediaSpace} 100%
  );
  margin-left: -1rem;
  gap: 8px;
`;

const RightDiv = styled.div`
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  border-color: ${({ theme }) => theme.primary.plainBorder};
  border-right-style: solid;
  border-right-width: 1px;
  margin: 0 0.25rem;
  padding-right: 1rem;
  font-weight: bold;
`;

const RightContainer = styled.div`
  display: flex;
  color: ${({ theme }) => theme.text.secondary};
`;

const SliderContainer = styled.div`
  display: flex;
  align-items: center;
  width: 8rem;
  padding-right: 1rem;
`;

const ImageContainerHeader = () => {
  const setGridZoom = useSetRecoilState(gridZoom);
  const gridZoomRangeValue = useRecoilValue(gridZoomRange);
  const theme = useTheme();
  const isGroup = useRecoilValue(isGroupAtom);
  const groupSlices = useRecoilValue(fos.groupSlices);
  const groupStats = useRecoilValue(groupStatistics(false));

  const shouldShowSliceSelector = useMemo(
    () => isGroup && groupSlices.length > 1,
    [isGroup, groupSlices]
  );

  return (
    <SamplesHeader data-cy={"fo-grid-actions"}>
      <GridActionsRow />
      <RightContainer>
        <Suspense
          fallback={
            <RightDiv>
              <LoadingDots text="Loading" />
            </RightDiv>
          }
        >
          <ResourceCount isGroup={groupStats === "group"} />
        </Suspense>
        {shouldShowSliceSelector && (
          <RightDiv>
            <GroupSliceSelector />
          </RightDiv>
        )}
        <SliderContainer>
          <div style={{ flexGrow: 1 }} title={"Zoom"}>
            <Slider
              valueAtom={gridZoom}
              boundsAtom={gridZoomRange}
              color={theme.primary.plainColor}
              showBounds={false}
              persistValue={false}
              showValue={false}
              onChange={true}
              style={{ padding: 0, margin: 0 }}
            />
          </div>
          <div
            title={"Reset zoom"}
            onClick={() => {
              setGridZoom(Math.max(gridZoomRangeValue[0], 5));
            }}
            style={{ cursor: "pointer", display: "flex" }}
          >
            <Apps />
          </div>
        </SliderContainer>
      </RightContainer>
    </SamplesHeader>
  );
};

export default ImageContainerHeader;
