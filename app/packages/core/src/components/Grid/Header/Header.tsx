import { LoadingDots } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isGroup as isGroupAtom } from "@fiftyone/state";
import {
  Icon,
  IconName,
  SingleValueSlider,
  Size,
  Toggle,
  Tooltip,
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
import GridHeaderSampleRendererControls from "./GridHeaderSampleRendererControls";
import GroupSlice from "./GroupSlice";
import Sort from "./Sort";

// Tactile feedback for the small icon affordances next to the
// spacing/zoom sliders and on the feature toggles. Pure CSS — Tailwind
// `hover:`/`active:` only fire on the element itself, so the classes
// must be applied to the click target, not nested children.
// Hover: scale up subtly to signal interactivity. Press: scale down for
// the click moment.
const PRESS_CLASS =
  "cursor-pointer flex items-center justify-center p-1.5 hover:scale-[1.1] active:scale-[0.92] transition-transform duration-[150ms] ease-out";

// Atom defaults — used as fallbacks when the stored value is NaN or
// otherwise non-finite. The storage effect clears bad entries (see
// `customEffects.ts`), so this guard is the one-frame safety net for
// legacy bad data already in users' browsers.
const SPACING_DEFAULT = 3;
const ZOOM_DEFAULT = ZOOM_RANGE[0];

const safeNumber = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

// Semi-transparent tooltip surface so grid samples stay partially
// visible behind the label. `!` enforces precedence over voodo Tooltip's
// solid Card2 background. `backdrop-blur-sm` adds a subtle blur so the
// text reads cleanly against busy content. `whitespace-nowrap` keeps
// short labels ("Hide scrubber") on a single line — voodo wraps tooltip
// content in `break-words` which can split on internal spaces under
// certain layouts.
const TOOLTIP_CLASS =
  "!bg-black/70 !text-white backdrop-blur-sm whitespace-nowrap";

const Spacing = () => {
  const [value, setValue] = useRecoilState(gridSpacing);
  const resetSpacing = useResetRecoilState(gridSpacing);
  // Without these guards, a `NaN` left in localStorage from an earlier
  // session feeds the slider, which emits onChange(NaN), the atom
  // round-trips NaN, and the component re-renders forever.
  const safeValue = safeNumber(value, SPACING_DEFAULT);
  const handleChange = (next: number) => {
    if (Number.isFinite(next)) setValue(next);
  };
  return (
    <SliderContainer>
      {/* `flexGrow: 1` must live on the Tooltip itself — it becomes the
          flex child of SliderContainer. Putting it on an inner div has
          no effect because the Tooltip's outer (Popover) wrapper sits
          in between and doesn't propagate the grow. Without this the
          slider has no width to render into and renders squished. */}
      <Tooltip
        content="Spacing"
        className={TOOLTIP_CLASS}
        portal
        style={{ flexGrow: 1, minWidth: 0 }}
      >
        <SingleValueSlider
          bare
          debounceDelay={0}
          min={0}
          max={64}
          step={1}
          value={safeValue}
          onChange={handleChange}
        />
      </Tooltip>
      <Tooltip content="Reset spacing" className={TOOLTIP_CLASS} portal>
        <div
          onClick={resetSpacing}
          onKeyDown={() => null}
          className={PRESS_CLASS}
        >
          <Icon name={IconName.Resize} size={Size.Xl} />
        </div>
      </Tooltip>
    </SliderContainer>
  );
};

const Zoom = () => {
  const [value, setValue] = useRecoilState(gridZoom);
  const resetZoom = useResetRecoilState(gridZoom);
  const safeValue = safeNumber(value, ZOOM_DEFAULT);
  const handleChange = (next: number) => {
    if (Number.isFinite(next)) setValue(next);
  };
  return (
    <SliderContainer>
      <Tooltip
        content="Zoom"
        className={TOOLTIP_CLASS}
        portal
        style={{ flexGrow: 1, minWidth: 0 }}
      >
        <SingleValueSlider
          bare
          debounceDelay={0}
          min={ZOOM_RANGE[0]}
          max={ZOOM_RANGE[1]}
          step={0.01}
          value={safeValue}
          onChange={handleChange}
        />
      </Tooltip>
      <Tooltip content="Reset zoom" className={TOOLTIP_CLASS} portal>
        <div onClick={resetZoom} onKeyDown={() => null} className={PRESS_CLASS}>
          <Icon name={IconName.Zoom} size={Size.Xl} />
        </div>
      </Tooltip>
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
    <Tooltip content="Scrubber" className={TOOLTIP_CLASS} portal>
      <RightDiv style={TOGGLE_ROW_STYLE}>
        <Toggle checked={enabled} onChange={setEnabled} aria-label="Scrubber" />
        <Icon name={IconName.Scrubber} size={Size.Xl} />
      </RightDiv>
    </Tooltip>
  );
};

const SwimlanesToggle = () => {
  const available = fos.useGridSwimlanesAvailable();
  const [enabled, setEnabled] = fos.useGridSwimlanes();
  if (!available) return null;
  return (
    <Tooltip content="Swimlanes" className={TOOLTIP_CLASS} portal>
      <RightDiv style={TOGGLE_ROW_STYLE}>
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          aria-label="Swimlanes"
        />
        <Icon name={IconName.Swimlanes} size={Size.Xl} />
      </RightDiv>
    </Tooltip>
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
        <GridHeaderSampleRendererControls />
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
