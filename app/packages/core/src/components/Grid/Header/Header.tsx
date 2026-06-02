import { LoadingDots } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isGroup as isGroupAtom } from "@fiftyone/state";
import {
  Icon,
  IconName,
  SingleValueSlider,
  Size,
  Toggle,
} from "@voxel51/voodo";
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

// Tactile feedback for the small icon affordances next to the
// spacing/zoom sliders and on the feature toggles. Pure CSS — Tailwind
// `hover:`/`active:` only fire on the element itself, so the classes
// must be applied to the click target, not nested children.
// Hover: scale up subtly to signal interactivity. Press: scale down for
// the click moment.
const PRESS_CLASS =
  "cursor-pointer flex hover:scale-[1.1] active:scale-[0.92] transition-transform duration-[150ms] ease-out";

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
        className={PRESS_CLASS}
      >
        <Icon name={IconName.Resize} size={Size.Xl} />
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
        className={PRESS_CLASS}
      >
        <Icon name={IconName.Zoom} size={Size.Xl} />
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
    <RightDiv style={TOGGLE_ROW_STYLE} title="Toggle grid scrubber">
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        aria-label="Toggle grid scrubber"
      />
      <Icon name={IconName.Scrubber} size={Size.Xl} />
    </RightDiv>
  );
};

const SwimlanesToggle = () => {
  const available = fos.useGridSwimlanesAvailable();
  const [enabled, setEnabled] = fos.useGridSwimlanes();
  if (!available) return null;
  return (
    <RightDiv style={TOGGLE_ROW_STYLE} title="Toggle grid swimlanes">
      <Toggle
        checked={enabled}
        onChange={setEnabled}
        aria-label="Toggle grid swimlanes"
      />
      <Icon name={IconName.Swimlanes} size={Size.Xl} />
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
