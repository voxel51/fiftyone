import {
  PopoutSectionTitle,
  Selector,
  TabOption,
  useTheme,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { groupStatistics } from "@fiftyone/state";
import type { RefObject } from "react";
import { default as React, useMemo } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import {
  MANAGING_GRID_MEMORY,
  OPTIMIZING_QUERY_PERFORMANCE,
} from "../../utils/links";
import Checkbox from "../Common/Checkbox";
import RadioGroup from "../Common/RadioGroup";
import { gridAutosizing, maxGridItemsSizeBytes } from "../Grid/recoil";
import { ActionOption } from "./Common";
import Popout from "./Popout";

const SortFilterResults = ({ modal }) => {
  const [{ count, asc }, setSortFilterResults] = useRecoilState(
    fos.sortFilterResults(modal)
  );
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  if (queryPerformance) {
    // sidebar sorting is not configurable
    return null;
  }

  return (
    <>
      <PopoutSectionTitle>Sort sidebar contents by</PopoutSectionTitle>
      <TabOption
        active={count ? "count" : "value"}
        options={[
          {
            text: "count",
            title: "Sort by count",
            onClick: () => !count && setSortFilterResults({ count: true, asc }),
          },
          {
            text: "value",
            title: "Sort by value",
            onClick: () => count && setSortFilterResults({ count: false, asc }),
          },
        ]}
      />
      <Checkbox
        name={"Reverse"}
        value={!asc}
        setValue={(value) => setSortFilterResults({ count, asc: !value })}
      />
    </>
  );
};

const Patches = ({ modal }: { modal: boolean }) => {
  const isPatches = useRecoilValue(fos.isPatchesView);
  const [crop, setCrop] = useRecoilState(fos.cropToContent(modal));

  if (!isPatches) {
    return null;
  }

  return (
    <>
      <PopoutSectionTitle>Patches</PopoutSectionTitle>
      <Checkbox
        name={"Crop to patch"}
        value={crop}
        setValue={(value) => setCrop(value)}
      />
    </>
  );
};

const MediaFields = ({ modal }) => {
  const [selectedMediaField, setSelectedMediaField] = useRecoilState(
    fos.selectedMediaField(modal)
  );
  const mediaFields = useRecoilValue(fos.mediaFields);

  if (!mediaFields || mediaFields?.length <= 1) return null;

  return (
    <>
      <PopoutSectionTitle>Media field</PopoutSectionTitle>
      <RadioGroup
        choices={mediaFields}
        value={selectedMediaField}
        setValue={(v) => v !== selectedMediaField && setSelectedMediaField(v)}
      />
    </>
  );
};

const GroupStatistics = ({ modal }) => {
  const [statistics, setStatistics] = useRecoilState(groupStatistics(modal));

  return (
    <>
      <PopoutSectionTitle>Statistics</PopoutSectionTitle>
      <TabOption
        active={statistics}
        options={["slice", "group"].map((value) => ({
          text: value,
          title: `View ${value} sidebar statistics`,
          onClick: () => setStatistics(value as "group" | "slice"),
        }))}
      />
    </>
  );
};

const DynamicGroupsViewMode = ({ modal }: { modal: boolean }) => {
  const isOrderedDynamicGroup = useRecoilValue(fos.isOrderedDynamicGroup);
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const [mode, setMode] = useRecoilState(fos.dynamicGroupsViewMode(modal));
  const setIsCarouselVisible = useSetRecoilState(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const setIsMainVisible = useSetRecoilState(
    fos.groupMediaIsMainVisibleSetting
  );

  const tabOptions = useMemo(() => {
    const options = [
      {
        text: "pagination",
        title: "Random Access",
        onClick: () => setMode("pagination"),
      },
    ];

    if (!hasGroupSlices) {
      options.push({
        text: "carousel",
        title: "Sequential Access",
        onClick: () => {
          setMode("carousel");
          setIsCarouselVisible(true);
        },
      });
    }

    if (isOrderedDynamicGroup) {
      options.push({
        text: "video",
        title: "Video",
        onClick: () => {
          setMode("video");
          setIsMainVisible(true);
        },
      });
    }

    return options;
  }, [
    isOrderedDynamicGroup,
    hasGroupSlices,
    setIsCarouselVisible,
    setIsMainVisible,
    setMode,
  ]);

  if (!modal && !isOrderedDynamicGroup) {
    return null;
  }

  return (
    <>
      <PopoutSectionTitle>Dynamic Groups Navigation</PopoutSectionTitle>
      {modal && <TabOption active={mode} options={tabOptions} />}
      {isOrderedDynamicGroup && !modal && (
        <Checkbox
          name={"Render frames as video"}
          value={mode === "video"}
          setValue={(value) => setMode(value ? "video" : "pagination")}
        />
      )}
    </>
  );
};

const QueryPerformance = () => {
  const theme = useTheme();
  const [enabled, setEnabled] = useRecoilState(fos.queryPerformance);
  if (!useRecoilValue(fos.enableQueryPerformanceConfig)) {
    return null;
  }

  return (
    <>
      <ActionOption
        id="qp-mode"
        text="Query Performance mode"
        href={OPTIMIZING_QUERY_PERFORMANCE}
        title={"More on Query Performance mode"}
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
      />
      <TabOption
        active={enabled ? "enabled" : "disabled"}
        options={["disabled", "enabled"].map((value) => ({
          text: value,
          title: value,
          dataCy: `qp-mode-${value}`,
          onClick: () => setEnabled(value === "enabled"),
        }))}
      />
    </>
  );
};

const HideFieldSetting = () => {
  const [hideNone, setHideNone] = useRecoilState(fos.hideNoneValuedFields);
  const theme = useTheme();

  return (
    <>
      <ActionOption
        id="hide-none-valued-field-setting"
        text="Hide None fields"
        title={"More on hiding none fields"}
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
      />
      <TabOption
        active={hideNone ? "enable" : "disable"}
        options={["disable", "enable"].map((value) => ({
          text: value,
          title: value,
          onClick: () => setHideNone(value === "enable"),
        }))}
      />
    </>
  );
};

const ShowModalNav = () => {
  const [showModalNavigationControls, setShowModalNavigationControls] =
    useRecoilState(fos.showModalNavigationControls);
  const theme = useTheme();

  return (
    <>
      <ActionOption
        id="show-modal-navigation-controls"
        text="Modal navigation controls"
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
      />
      <TabOption
        active={showModalNavigationControls ? "enable" : "disable"}
        options={["disable", "enable"].map((value) => ({
          text: value,
          title: value,
          onClick: () => setShowModalNavigationControls(value === "enable"),
        }))}
      />
    </>
  );
};

const Grid = () => {
  const [autosizing, setAutosizing] = useRecoilState(gridAutosizing);
  const resetSizeBytes = useResetRecoilState(maxGridItemsSizeBytes);
  const [sizeBytes, setSizeBytes] = useRecoilState(maxGridItemsSizeBytes);
  const theme = useTheme();

  return (
    <>
      <ActionOption
        id="grid-options"
        href={MANAGING_GRID_MEMORY}
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
        text="Grid settings"
        title={"More on grid settings"}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          columnGap: "0.5rem",
        }}
      >
        <Selector
          placeholder="size"
          onSelect={async (text) => {
            if (text === "") {
              resetSizeBytes();
              return "";
            }
            const value = Number.parseInt(text);

            if (!Number.isNaN(value)) {
              setSizeBytes(value * 1e6);
              return text;
            }

            return "";
          }}
          inputStyle={{
            fontSize: "1rem",
            textAlign: "right",
            float: "right",
          }}
          key={"grid-cache-size"}
          value={(sizeBytes / 1e6).toString()}
          containerStyle={{ display: "flex", justifyContent: "right", flex: 1 }}
        />
        <div>MB cache</div>
      </div>
      <Checkbox
        name={"Autosizing"}
        value={autosizing}
        setValue={(value) => {
          setAutosizing(value);
        }}
      />
    </>
  );
};

type OptionsProps = {
  modal?: boolean;
  anchorRef: RefObject<HTMLElement>;
};

const Options = ({ modal, anchorRef }: OptionsProps) => {
  const isGroup = useRecoilValue(fos.isGroup);
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);
  const view = useRecoilValue(fos.view);

  return (
    <Popout modal={modal} fixed anchorRef={anchorRef}>
      {modal && <HideFieldSetting />}
      {modal && <ShowModalNav />}
      {isDynamicGroup && <DynamicGroupsViewMode modal={!!modal} />}
      {isGroup && !isDynamicGroup && <GroupStatistics modal={modal} />}
      <MediaFields modal={modal} />
      <Patches modal={!!modal} />
      {!view?.length && <QueryPerformance />}
      <SortFilterResults modal={modal} />
      {!modal && <Grid />}
    </Popout>
  );
};

export default React.memo(Options);
