import { Autorenew, Check } from "@mui/icons-material";
import React from "react";
import {
  constSelector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import { PopoutSectionTitle, TabOption } from "@fiftyone/components";
import Checkbox from "../Common/Checkbox";

import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  configuredSidebarModeDefault,
  groupStatistics,
  isGroup,
  sidebarMode,
} from "@fiftyone/state";
import RadioGroup from "../Common/RadioGroup";
import { Slider } from "../Common/RangeSlider";
import { Button } from "../utils";
import Popout from "./Popout";

export const RefreshButton = ({ modal }) => {
  const [colorSeed, setColorSeed] = useRecoilState(
    fos.colorSeed(Boolean(modal))
  );
  return (
    <>
      <Button
        text={
          <span style={{ display: "flex", justifyContent: "center" }}>
            Refresh colors{" "}
            <Autorenew
              style={{
                marginLeft: "0.25rem",
                color: "inherit",
              }}
            />
          </span>
        }
        title={"Refresh colors"}
        onClick={() => setColorSeed(colorSeed + 1)}
        style={{
          margin: "0.25rem -0.5rem",
          height: "2rem",
          borderRadius: 0,
          textAlign: "center",
        }}
      ></Button>
    </>
  );
};

const ColorBy = ({ modal }) => {
  const [colorBy, setColorBy] = useRecoilState<string>(
    fos.appConfigOption({ modal, key: "colorBy" })
  );

  return (
    <>
      <PopoutSectionTitle>Color by</PopoutSectionTitle>

      <TabOption
        active={colorBy}
        options={["field", "value"].map((value) => {
          return {
            text: value,
            title: `Color by ${value}`,
            onClick: () => colorBy !== value && setColorBy(value),
          };
        })}
      />
    </>
  );
};

const Keypoints = ({ modal }) => {
  const [shown, setShown] = useRecoilState<boolean>(
    fos.appConfigOption({ key: "showSkeletons", modal })
  );
  const [points, setPoints] = useRecoilState<boolean>(
    fos.appConfigOption({ key: "multicolorKeypoints", modal })
  );

  return (
    <>
      <Checkbox
        name={"Multicolor keypoints"}
        value={Boolean(points)}
        setValue={(value) => setPoints(value)}
      />
      <Checkbox
        name={"Show keypoint skeletons"}
        value={Boolean(shown)}
        setValue={(value) => setShown(value)}
      />
    </>
  );
};

const Opacity = ({ modal }) => {
  const theme = useTheme();
  const [alpha, setAlpha] = useRecoilState(fos.alpha(modal));

  return (
    <>
      <PopoutSectionTitle style={{ display: "flex", height: 33 }}>
        <span>Label opacity</span>
        {alpha !== fos.DEFAULT_ALPHA && (
          <span
            onClick={() => setAlpha(fos.DEFAULT_ALPHA)}
            style={{ cursor: "pointer", margin: "0.25rem" }}
            title={"Reset label opacity"}
          >
            <Check />
          </span>
        )}
      </PopoutSectionTitle>

      <Slider
        valueAtom={fos.alpha(modal)}
        boundsAtom={constSelector([0, 1])}
        color={theme.primary.plainColor}
        showBounds={false}
        persistValue={false}
        showValue={false}
        onChange={true}
        style={{ padding: 0 }}
        int={false}
      />
    </>
  );
};

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
};

const Options = ({ modal, bounds }: OptionsProps) => {
  const group = useRecoilValue(isGroup);
  return (
    <Popout modal={modal} bounds={bounds}>
      <ColorBy modal={modal} />
      <RefreshButton modal={modal} />
      <Opacity modal={modal} />
      {group && <GroupStatistics modal={modal} />}
      <Keypoints modal={modal} />
      <MediaFields modal={modal} />
      <Patches modal={modal} />
      {!modal && <SidebarMode modal={modal} />}
      <SortFilterResults modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
