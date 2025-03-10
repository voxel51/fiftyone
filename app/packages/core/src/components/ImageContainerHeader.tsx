import { LoadingDots, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isGroup as isGroupAtom } from "@fiftyone/state";
import { Apps, ImageAspectRatio } from "@mui/icons-material";
import Color from "color";
import React, { Suspense, useMemo } from "react";
import { constSelector, useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";
import { GridActionsRow } from "./Actions";
import { Slider } from "./Common/RangeSlider";
import { ZOOM_RANGE, gridZoom } from "./Grid";
import { gridSpacing } from "./Grid/recoil";
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
  width: 7.375rem;
  padding-right: 0.375rem;
`;

const Spacing = () => {
  const theme = useTheme();
  const resetSpacing = useResetRecoilState(gridSpacing);
  return (
    <SliderContainer>
      <div style={{ flexGrow: 1 }} title={"Spacing"}>
        <Slider
          valueAtom={gridSpacing}
          boundsAtom={constSelector([0, 64])}
          color={theme.primary.plainColor}
          showBounds={false}
          persistValue={false}
          showValue={false}
          style={{ padding: 0, margin: 0 }}
        />
      </div>
      <div
        title={"Reset spacing"}
        onClick={resetSpacing}
        onKeyDown={() => null}
        style={{ cursor: "pointer", display: "flex" }}
      >
        <Apps />
      </div>
    </SliderContainer>
  );
};

const Zoom = () => {
  const resetZoom = useResetRecoilState(gridZoom);

  const theme = useTheme();
  return (
    <SliderContainer>
      <div style={{ flexGrow: 1 }} title={"Zoom"}>
        <Slider
          valueAtom={gridZoom}
          boundsAtom={constSelector(ZOOM_RANGE)}
          color={theme.primary.plainColor}
          showBounds={false}
          persistValue={false}
          showValue={false}
          style={{ padding: 0, margin: 0 }}
        />
      </div>
      <div
        title={"Reset zoom"}
        onClick={resetZoom}
        onKeyDown={() => null}
        style={{ cursor: "pointer", display: "flex" }}
      >
        <ImageAspectRatio />
      </div>
    </SliderContainer>
  );
};

const ImageContainerHeader = () => {
  const isGroup = useRecoilValue(isGroupAtom);
  const groupSlices = useRecoilValue(fos.groupSlices);
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
              <LoadingDots />
            </RightDiv>
          }
        >
          <ResourceCount />
        </Suspense>
        {shouldShowSliceSelector && (
          <RightDiv>
            <GroupSliceSelector />
          </RightDiv>
        )}
        <Spacing />
        <Zoom />
      </RightContainer>
    </SamplesHeader>
  );
};

export default ImageContainerHeader;
