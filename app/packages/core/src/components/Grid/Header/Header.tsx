import { LoadingDots, Tooltip, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isGroup as isGroupAtom } from "@fiftyone/state";
import { Apps, ImageAspectRatio, QuestionMark } from "@mui/icons-material";
import React, { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { constSelector, useRecoilValue, useResetRecoilState } from "recoil";
import { Slider } from "../../Common/RangeSlider";
import ResourceCount from "../../ResourceCount";
import Actions from "../Actions";
import { gridSpacing, gridZoom } from "../recoil";
import { ZOOM_RANGE } from "../useZoomSetting";
import {
  RightContainer,
  RightDiv,
  SamplesHeader,
  SliderContainer,
} from "./Containers";
import GroupSlice from "./GroupSlice";
import Sort from "./Sort";

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

const Header = () => {
  const isGroup = useRecoilValue(isGroupAtom);
  const groupSlices = useRecoilValue(fos.groupSlices);
  const shouldShowSliceSelector = useMemo(
    () => isGroup && groupSlices.length > 1,
    [isGroup, groupSlices]
  );

  return (
    <SamplesHeader data-cy={"fo-grid-actions"}>
      <Actions key={"actions"} />
      <RightContainer key={"options"}>
        <Suspense
          fallback={
            <RightDiv>
              <LoadingDots />
            </RightDiv>
          }
        >
          <ErrorBoundary fallback={<TimedOut />}>
            <ResourceCount />
          </ErrorBoundary>
        </Suspense>
        {shouldShowSliceSelector && (
          <RightDiv>
            <GroupSlice />
          </RightDiv>
        )}
        <Sort />
        <Spacing />
        <Zoom />
      </RightContainer>
    </SamplesHeader>
  );
};

export const TimedOut = () => {
  const theme = useTheme();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Tooltip placement="top-center" text="Query timed out at 10 seconds">
        <QuestionMark
          style={{
            marginRight: 2,
            color: theme.text.secondary,
            height: 14,
            width: 14,
          }}
        />
      </Tooltip>
    </div>
  );
};

export default Header;
