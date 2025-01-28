import { PopoutSectionTitle, TabOption, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { groupStatistics } from "@fiftyone/state";
import type { RefObject } from "react";
import { default as React, useEffect, useMemo, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { QP_MODE } from "../../utils/links";
import Checkbox from "../Common/Checkbox";
import Input from "../Common/Input";
import RadioGroup from "../Common/RadioGroup";
import { maxGridItemsSizeBytes } from "../Grid/recoil";
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
        href={QP_MODE}
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

const GridCache = () => {
  const [sizeBytes, setSizeBytes] = useRecoilState(maxGridItemsSizeBytes);
  const [local, setLocal] = useState<number | "">("");
  const theme = useTheme();
  useEffect(() => {
    setLocal(sizeBytes / 1e6);
  }, [sizeBytes]);

  return (
    <>
      <ActionOption
        id="grid-cache"
        text="Grid cache (MB)"
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
      />
      <Input
        placeholder="Grid cache size (MB)"
        onEnter={() =>
          local ? setSizeBytes(local * 1e6) : setLocal(sizeBytes / 1e6)
        }
        setter={(v) => setLocal(v === "" ? v : Number.parseInt(v))}
        value={(local ?? sizeBytes).toString()}
        validator={(value) => {
          const v = Number.parseInt(value);
          return v * 1e6 < 1e10;
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
      <Patches modal={modal} />
      {!view?.length && <QueryPerformance />}
      <SortFilterResults modal={modal} />
      {!modal && <GridCache />}
    </Popout>
  );
};

export default React.memo(Options);
