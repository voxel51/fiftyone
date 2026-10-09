import * as fos from "@fiftyone/state";
import { groupStatistics } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { default as React, useMemo } from "react";
import {
  useReverbState,
  useReverbValue,
  useResetReverbState,
  useSetReverbState,
} from "@fiftyone/reverb";
import {
  MANAGING_GRID_MEMORY,
  OPTIMIZING_QUERY_PERFORMANCE,
  QUERY_PERFORMANCE_RESULTS,
} from "@fiftyone/utilities";
import RadioGroup from "../../Common/RadioGroup";
import {
  PanelCheckbox,
  PanelNumber,
  PanelSection,
  type PanelTab,
  PanelTabs,
} from "../Panel";
import Popout from "../Popout";
import MultimodalGridFitSetting from "./MultimodalGridFitSetting";

const toggle = (
  enabled: boolean,
  set: (enabled: boolean) => void,
  [off, on]: [string, string],
) => ({
  active: enabled ? on : off,
  options: [off, on].map((value) => ({
    text: value,
    title: value,
    onClick: () => set(value === on),
  })),
});

const SortFilterResults = ({ modal }) => {
  const [{ count, asc }, setSortFilterResults] = useReverbState(
    fos.sortFilterResults(modal),
  );
  const queryPerformance = useReverbValue(fos.queryPerformance);
  if (queryPerformance) {
    // sidebar sorting is not configurable
    return null;
  }

  return (
    <PanelSection title="Sort sidebar contents by">
      <PanelTabs
        active={count ? "count" : "value"}
        options={[
          {
            text: "count",
            title: "Sort by count",
            onClick: () => setSortFilterResults({ count: true, asc }),
          },
          {
            text: "value",
            title: "Sort by value",
            onClick: () => setSortFilterResults({ count: false, asc }),
          },
        ]}
      />
      <PanelCheckbox
        name="Reverse"
        value={!asc}
        setValue={(value) => setSortFilterResults({ count, asc: !value })}
      />
    </PanelSection>
  );
};

const Patches = ({ modal }: { modal: boolean }) => {
  const isPatches = useReverbValue(fos.isPatchesView);
  const [crop, setCrop] = useReverbState(fos.cropToContent(modal));

  if (!isPatches) {
    return null;
  }

  return (
    <PanelSection title="Patches">
      <PanelCheckbox name="Crop to patch" value={crop} setValue={setCrop} />
    </PanelSection>
  );
};

const MediaFields = ({ modal }) => {
  const [selectedMediaField, setSelectedMediaField] = useReverbState(
    fos.selectedMediaField(modal),
  );
  const mediaFields = useReverbValue(fos.mediaFields);

  if (!mediaFields || mediaFields?.length <= 1) return null;

  return (
    <PanelSection title="Media field">
      <RadioGroup
        choices={mediaFields}
        value={selectedMediaField}
        setValue={(v) => v !== selectedMediaField && setSelectedMediaField(v)}
      />
    </PanelSection>
  );
};

const GroupStatistics = ({ modal }) => {
  const [statistics, setStatistics] = useReverbState(groupStatistics(modal));

  return (
    <PanelSection title="Statistics">
      <PanelTabs
        active={statistics}
        options={["slice", "group"].map((value) => ({
          text: value,
          title: `View ${value} sidebar statistics`,
          onClick: () => setStatistics(value as "group" | "slice"),
        }))}
      />
    </PanelSection>
  );
};

const DynamicGroupsViewMode = ({ modal }: { modal: boolean }) => {
  const isOrderedDynamicGroup = useReverbValue(fos.isOrderedDynamicGroup);
  const hasGroupSlices = useReverbValue(fos.hasGroupSlices);

  const [mode, setMode] = useReverbState(fos.dynamicGroupsViewMode(modal));
  const setIsCarouselVisible = useSetReverbState(
    fos.groupMediaIsCarouselVisibleSetting,
  );
  const setIsMainVisible = useSetReverbState(
    fos.groupMediaIsMain2DViewerVisibleSetting,
  );

  const tabOptions = useMemo(() => {
    const options: PanelTab[] = [
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
    <PanelSection title="Dynamic Groups Navigation">
      {modal && <PanelTabs active={mode} options={tabOptions} />}
      {isOrderedDynamicGroup && !modal && (
        <PanelCheckbox
          name="Render frames as video"
          value={mode === "video"}
          setValue={(value) => setMode(value ? "video" : "pagination")}
        />
      )}
    </PanelSection>
  );
};

const QueryPerformance = () => {
  const [enabled, setEnabled] = useReverbState(fos.queryPerformance);
  const [maxSearch, setMaxSearch] = useReverbState(
    fos.queryPerformanceMaxSearch,
  );
  const resetMaxSearch = useResetReverbState(fos.queryPerformanceMaxSearch);
  if (!useReverbValue(fos.enableQueryPerformanceConfig)) {
    return null;
  }

  return (
    <>
      <PanelSection
        href={OPTIMIZING_QUERY_PERFORMANCE}
        linkTitle="More on Query Performance mode"
        title="Query Performance mode"
      >
        <PanelTabs
          active={enabled ? "enabled" : "disabled"}
          options={["disabled", "enabled"].map((value) => ({
            text: value,
            title: value,
            dataCy: `qp-mode-${value}`,
            onClick: () => setEnabled(value === "enabled"),
          }))}
        />
      </PanelSection>
      {enabled && (
        <PanelSection
          href={QUERY_PERFORMANCE_RESULTS}
          linkTitle="More on unindexed sidebar results"
          title="Unindexed sidebar results"
        >
          <PanelNumber
            unit="doc limit"
            value={maxSearch}
            onCommit={(value) =>
              value === null ? resetMaxSearch() : setMaxSearch(value)
            }
          />
        </PanelSection>
      )}
    </>
  );
};

const HideFieldSetting = () => {
  const [hideNone, setHideNone] = useReverbState(fos.hideNoneValuedFields);

  return (
    <PanelSection title="Hide None fields">
      <PanelTabs {...toggle(hideNone, setHideNone, ["disable", "enable"])} />
    </PanelSection>
  );
};

const ShowModalNav = () => {
  const [shown, setShown] = useReverbState(fos.showModalNavigationControls);

  return (
    <PanelSection title="Modal navigation controls">
      <PanelTabs {...toggle(shown, setShown, ["disable", "enable"])} />
    </PanelSection>
  );
};

const Grid = () => {
  const [autosizing, setAutosizing] = useReverbState(fos.gridAutosizing);
  const resetSizeBytes = useResetReverbState(fos.maxGridItemsSizeBytes);
  const [sizeBytes, setSizeBytes] = useReverbState(fos.maxGridItemsSizeBytes);

  return (
    <>
      <MultimodalGridFitSetting />
      <PanelSection
        href={MANAGING_GRID_MEMORY}
        linkTitle="More on grid settings"
        title="Grid settings"
      >
        <PanelNumber
          placeholder="size"
          unit="MB cache"
          value={sizeBytes / 1e6}
          onCommit={(value) =>
            value === null ? resetSizeBytes() : setSizeBytes(value * 1e6)
          }
        />
        <PanelCheckbox
          name="Autosizing"
          value={autosizing}
          setValue={setAutosizing}
        />
      </PanelSection>
    </>
  );
};

const Options = ({ modal }: { modal?: boolean }) => {
  const isGroup = useReverbValue(fos.isGroup);
  const isDynamicGroup = useReverbValue(fos.isDynamicGroup);
  const view = useReverbValue(fos.view);
  const mode = useAtomValue(fos.modalMode);

  const exploreWithModal = modal && mode === fos.EXPLORE;
  const annotateWithModal = modal && mode === fos.ANNOTATE;

  return (
    <Popout modal={modal}>
      {exploreWithModal && <HideFieldSetting />}
      {modal && <ShowModalNav />}
      {!annotateWithModal && isDynamicGroup && (
        <DynamicGroupsViewMode modal={!!modal} />
      )}
      {!annotateWithModal && isGroup && !isDynamicGroup && (
        <GroupStatistics modal={modal} />
      )}
      {!annotateWithModal && <MediaFields modal={modal} />}
      {!annotateWithModal && <Patches modal={!!modal} />}
      {!annotateWithModal && !view?.length && <QueryPerformance />}
      {!annotateWithModal && <SortFilterResults modal={modal} />}
      {!modal && <Grid />}
    </Popout>
  );
};

export default React.memo(Options);
