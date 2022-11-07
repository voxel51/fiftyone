import React from "react";
import { Autorenew, Check } from "@mui/icons-material";
import { constSelector, useRecoilState, useRecoilValue } from "recoil";

import Checkbox from "../Common/Checkbox";
import { PopoutSectionTitle, TabOption } from "@fiftyone/components";

import { Button } from "../utils";
import Popout from "./Popout";
import { Slider } from "../Common/RangeSlider";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { groupStatistics, isGroup } from "@fiftyone/state";

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
        options={["field", "instance", "label"].map((value) => {
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
      <PopoutSectionTitle>Media Field</PopoutSectionTitle>

      <TabOption
        active={selectedMediaField}
        options={mediaFields.map((value) => {
          return {
            text: value,
            title: `View Media with "${selectedMediaField}"`,
            onClick: () => {
              selectedMediaField !== value && setSelectedMediaField(value);
            },
          };
        })}
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

type OptionsProps = {
  modal: boolean;
  bounds: [number, number];
};

const Options = ({ modal, bounds }: OptionsProps) => {
  const group = useRecoilValue(isGroup);
  return (
    <Popout modal={modal} bounds={bounds}>
      {group && <GroupStatistics modal={modal} />}
      <MediaFields modal={modal} />
      <ColorBy modal={modal} />
      <RefreshButton modal={modal} />
      <Opacity modal={modal} />
      <SortFilterResults modal={modal} />
      <Keypoints modal={modal} />
      <Patches modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
