import { Autorenew } from "@mui/icons-material";
import React, { MutableRefObject } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";

import { PopoutSectionTitle, TabOption } from "@fiftyone/components";
import Checkbox from "../Common/Checkbox";

import * as fos from "@fiftyone/state";
import {
  configuredSidebarModeDefault,
  groupStatistics,
  sidebarMode,
} from "@fiftyone/state";
import RadioGroup from "../Common/RadioGroup";
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

  if (mediaFields.length <= 1) return null;

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

const SidebarMode = ({ modal }) => {
  const mode = useRecoilValue(configuredSidebarModeDefault(modal));
  const setMode = useSetRecoilState(sidebarMode(modal));

  return (
    <>
      <PopoutSectionTitle>Sidebar mode</PopoutSectionTitle>
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

type OptionsProps = {
  modal: boolean;
  bounds: [number, number];
  anchorRef: MutableRefObject<unknown>;
};

const Options = ({ modal, bounds, anchorRef }: OptionsProps) => {
  const isGroup = useRecoilValue(fos.isGroup);
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);

  return (
    <Popout modal={modal} bounds={bounds} fixed anchorRef={anchorRef}>
      {isGroup && !isDynamicGroup && <GroupStatistics modal={modal} />}
      <MediaFields modal={modal} />
      <Patches modal={modal} />
      {!modal && <SidebarMode modal={modal} />}
      <SortFilterResults modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
