import {
  PopoutSectionTitle,
  Selector,
  TabOption,
  useTheme,
} from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  configuredSidebarModeDefault,
  groupStatistics,
  sidebarMode,
} from "@fiftyone/state";
import React, { RefObject, useMemo } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { LIGHTNING_MODE, SIDEBAR_MODE } from "../../utils/links";
import Checkbox from "../Common/Checkbox";
import RadioGroup from "../Common/RadioGroup";
import { Button } from "../utils";
import { ActionOption } from "./Common";
import Popout from "./Popout";

const SortFilterResults = ({ modal }) => {
  const [{ count, asc }, setSortFilterResults] = useRecoilState(
    fos.sortFilterResults(modal)
  );

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

const Patches = ({ modal }) => {
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

const SidebarMode = () => {
  const mode = useRecoilValue(configuredSidebarModeDefault(false));
  const setMode = useSetRecoilState(sidebarMode(false));
  const theme = useTheme();

  return (
    <>
      <ActionOption
        id="sidebar-mode"
        text="Sidebar mode"
        href={SIDEBAR_MODE}
        title={"More on sidebar mode"}
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
      />

      <TabOption
        active={mode}
        options={["fast", "best", "all"].map((value) => ({
          text: value,
          title: value,
          onClick: () => setMode(value as "fast" | "best" | "all"),
        }))}
      />
    </>
  );
};

const DynamicGroupsViewMode = ({ modal }: { modal: boolean }) => {
  const isOrderedDynamicGroup = useRecoilValue(fos.isOrderedDynamicGroup);
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const [mode, setMode] = useRecoilState(fos.dynamicGroupsViewMode);
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
  }, [isOrderedDynamicGroup, hasGroupSlices]);

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

const Lightning = () => {
  const [threshold, setThreshold] = useRecoilState(fos.lightningThreshold);
  const config = useRecoilValue(fos.lightningThresholdConfig);
  const reset = useResetRecoilState(fos.lightningThreshold);
  const count = useRecoilValue(fos.datasetSampleCount);
  const theme = useTheme();

  return (
    <>
      <ActionOption
        id="lightning-mode"
        text="Lightning mode"
        href={LIGHTNING_MODE}
        title={"More on lightning mode"}
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
      />
      <TabOption
        active={threshold === null ? "disable" : "enable"}
        options={["disable", "enable"].map((value) => ({
          text: value,
          title: value,
          dataCy: `lightning-mode-${value}`,
          onClick: () =>
            setThreshold(value === "disable" ? null : config ?? count),
        }))}
      />
      {threshold !== null && (
        <>
          <Selector
            placeholder="sample threshold"
            onSelect={async (text) => {
              if (text === "") {
                reset();
                return "";
              }
              const value = parseInt(text);

              if (!isNaN(value)) {
                setThreshold(value);
                return text;
              }

              return "";
            }}
            inputStyle={{
              fontSize: "1rem",
              textAlign: "right",
              float: "right",
              width: "100%",
            }}
            key={threshold}
            value={threshold === null ? "" : String(threshold)}
            containerStyle={{ display: "flex", justifyContent: "right" }}
          />
          {config !== threshold && config !== null && (
            <Button
              style={{
                margin: "0.25rem -0.5rem",
                height: "2rem",
                borderRadius: 0,
                textAlign: "center",
              }}
              text={"Reset"}
              onClick={reset}
            />
          )}
        </>
      )}
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
          onClick: () => setHideNone(value === "enable" ? true : false),
        }))}
      />
    </>
  );
};

type OptionsProps = {
  modal: boolean;
  anchorRef: RefObject<HTMLElement>;
};

const Options = ({ modal, anchorRef }: OptionsProps) => {
  const isGroup = useRecoilValue(fos.isGroup);
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);
  const view = useRecoilValue(fos.view);

  return (
    <Popout modal={modal} fixed anchorRef={anchorRef}>
      {modal && <HideFieldSetting />}
      {isDynamicGroup && <DynamicGroupsViewMode modal={modal} />}
      {isGroup && !isDynamicGroup && <GroupStatistics modal={modal} />}
      <MediaFields modal={modal} />
      <Patches modal={modal} />
      {!view?.length && <Lightning />}
      {!modal && <SidebarMode />}
      <SortFilterResults modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
