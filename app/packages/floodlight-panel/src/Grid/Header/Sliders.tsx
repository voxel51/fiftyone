import { SingleValueSlider, Tooltip } from "@voxel51/voodo";
import { useReverbState, useResetReverbState } from "@fiftyone/reverb";
import { gridSpacing, gridZoom } from "../atoms";
import { ZOOM_RANGE } from "../useZoomSetting";
import { PRESS_CLASS, TOOLTIP_CLASS } from "./classes";
import { SliderContainer } from "./Containers";
import { ResizeIcon, ZoomIcon } from "./icons";

// Atom defaults — used as fallbacks when the stored value is NaN or
// otherwise non-finite. The storage effect clears bad entries (see
// `customEffects.ts`), so this guard is the one-frame safety net for
// legacy bad data already in users' browsers.
const SPACING_DEFAULT = 3;
const ZOOM_DEFAULT = ZOOM_RANGE[0];

const safeNumber = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export const Spacing = () => {
  const [value, setValue] = useReverbState(gridSpacing);
  const resetSpacing = useResetReverbState(gridSpacing);
  // Without these guards, a `NaN` left in localStorage from an earlier
  // session feeds the slider, which emits onChange(NaN), the atom
  // round-trips NaN, and the component re-renders forever.
  const safeValue = safeNumber(value, SPACING_DEFAULT);
  const handleChange = (next: number) => {
    if (Number.isFinite(next)) setValue(next);
  };
  return (
    <SliderContainer style={{ width: "100%" }}>
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
          <ResizeIcon />
        </div>
      </Tooltip>
    </SliderContainer>
  );
};

export const Zoom = () => {
  const [value, setValue] = useReverbState(gridZoom);
  const resetZoom = useResetReverbState(gridZoom);
  const safeValue = safeNumber(value, ZOOM_DEFAULT);
  const handleChange = (next: number) => {
    if (Number.isFinite(next)) setValue(next);
  };
  return (
    <SliderContainer style={{ width: "100%" }}>
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
          <ZoomIcon />
        </div>
      </Tooltip>
    </SliderContainer>
  );
};
