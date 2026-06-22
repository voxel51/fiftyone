import { LoadingDots, Selector, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isGroup as isGroupAtom } from "@fiftyone/state";
import { Apps, ImageAspectRatio } from "@mui/icons-material";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  constSelector,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { Slider } from "../../Common/RangeSlider";
import ResourceCount from "../../ResourceCount";
import Actions from "../Actions";
import {
  gridAspectRatio,
  gridHeaderHeight,
  gridSpacing,
  gridZoom,
} from "../recoil";
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

// "auto" = each tile uses its media's own aspect ratio (variable) — the justified,
// cursor-paginated Spotlight grid. A fixed "W:H" makes every tile that shape, which
// enables the fully-virtualized infinite grid. Free text is accepted too.
const AR_OPTIONS = ["auto", "1:1", "4:3", "3:2", "16:9", "2:3", "9:16"];

const AspectRatioOption = ({ value }: { value: string }) => <>{value}</>;

const AspectRatio = () => {
  const [value, setValue] = useRecoilState(gridAspectRatio);
  const useSearch = useCallback((search: string) => {
    const values = AR_OPTIONS.filter((v) => v.includes(search));
    return { values, total: values.length };
  }, []);

  return (
    <Selector
      inputStyle={{ height: 28, width: 72 }}
      component={AspectRatioOption}
      containerStyle={{ marginLeft: "0.5rem", position: "relative" }}
      onSelect={async (v) => {
        const next = v || "auto";
        setValue(next);
        return next;
      }}
      overflow={true}
      placeholder={"aspect ratio"}
      useSearch={useSearch}
      value={value}
    />
  );
};

const Header = () => {
  const isGroup = useRecoilValue(isGroupAtom);
  const groupSlices = useRecoilValue(fos.groupSlices);
  const shouldShowSliceSelector = useMemo(
    () => isGroup && groupSlices.length > 1,
    [isGroup, groupSlices]
  );

  // publish the bar's height so the grid can inset its first row below it (overlap
  // only on scroll). It changes with controls wrapping / window width, so track live.
  const headerRef = useRef<HTMLDivElement>(null);
  const setHeaderHeight = useSetRecoilState(gridHeaderHeight);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    // round so sub-pixel jitter from the observer doesn't churn the grid layout;
    // recoil bails on an unchanged value, so a stable bar fires zero re-renders.
    const measure = () =>
      setHeaderHeight(Math.round(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setHeaderHeight(0);
    };
  }, [setHeaderHeight]);

  return (
    <SamplesHeader ref={headerRef} data-cy={"fo-grid-actions"}>
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
        <AspectRatio />
        <Spacing />
        <Zoom />
      </RightContainer>
    </SamplesHeader>
  );
};

export default Header;
