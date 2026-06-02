import { LoadingDots } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isGroup as isGroupAtom } from "@fiftyone/state";
import { Apps, ImageAspectRatio } from "@mui/icons-material";
import { SingleValueSlider, Toggle } from "@voxel51/voodo";
import React, { Suspense, useMemo } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
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
  const [value, setValue] = useRecoilState(gridSpacing);
  const resetSpacing = useResetRecoilState(gridSpacing);
  return (
    <SliderContainer>
      <div style={{ flexGrow: 1 }} title={"Spacing"}>
        <SingleValueSlider
          bare
          debounceDelay={0}
          min={0}
          max={64}
          step={1}
          value={value}
          onChange={setValue}
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
  const [value, setValue] = useRecoilState(gridZoom);
  const resetZoom = useResetRecoilState(gridZoom);
  return (
    <SliderContainer>
      <div style={{ flexGrow: 1 }} title={"Zoom"}>
        <SingleValueSlider
          bare
          debounceDelay={0}
          min={ZOOM_RANGE[0]}
          max={ZOOM_RANGE[1]}
          step={0.01}
          value={value}
          onChange={setValue}
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

// RightDiv defaults to `flex-direction: column`; override to row so the
// switch and its label sit side-by-side (switch on the left, label on
// the right).
const TOGGLE_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
};

const ScrubberToggle = () => {
  const available = fos.useGridScrubberAvailable();
  const [enabled, setEnabled] = fos.useGridScrubber();
  if (!available) return null;
  return (
    <RightDiv style={TOGGLE_ROW_STYLE}>
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        aria-label="Toggle grid scrubber"
      />
      <span>Scrubber</span>
    </RightDiv>
  );
};

const SwimlanesToggle = () => {
  const available = fos.useGridSwimlanesAvailable();
  const [enabled, setEnabled] = fos.useGridSwimlanes();
  if (!available) return null;
  return (
    <RightDiv style={TOGGLE_ROW_STYLE}>
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        aria-label="Toggle grid swimlanes"
      />
      <span>Swimlanes</span>
    </RightDiv>
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
          <ResourceCount />
        </Suspense>
        {shouldShowSliceSelector && (
          <RightDiv>
            <GroupSlice />
          </RightDiv>
        )}
        <Sort />
        <Spacing />
        <Zoom />
        <SwimlanesToggle />
        <ScrubberToggle />
      </RightContainer>
    </SamplesHeader>
  );
};

export default Header;
