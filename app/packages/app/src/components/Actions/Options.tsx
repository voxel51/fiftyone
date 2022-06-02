import React from "react";
import { Autorenew, Check } from "@material-ui/icons";
import { constSelector, useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../../recoil/atoms";
import * as schemaAtoms from "../../recoil/schema";
import * as selectors from "../../recoil/selectors";
import * as viewAtoms from "../../recoil/view";

import Checkbox from "../Common/Checkbox";
import { PopoutSectionTitle, TabOption } from "../utils";

import { Button } from "../utils";
import Popout from "./Popout";
import { Slider } from "../Common/RangeSlider";
import { useTheme } from "@fiftyone/components";
import { Field } from "@fiftyone/utilities";
import { State } from "../../recoil/types";

export const RefreshButton = ({ modal }) => {
  const [colorSeed, setColorSeed] = useRecoilState(
    atoms.colorSeed(Boolean(modal))
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
    selectors.appConfigOption({ modal, key: "colorBy" })
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

const MediaFields = ({ modal }) => {
  const fieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE, filtered: true })
  );
  let [selectedField, setSelectedField] = useRecoilState<Field>(
    atoms.selectedMediaField
  );

  if (!selectedField) selectedField = fieldSchema.filepath;
  const fields = Object.values(fieldSchema).filter((field) =>
    field.ftype.includes("MediaField")
  );

  if (fields.length === 0) return null;

  return (
    <>
      <PopoutSectionTitle>Media Field</PopoutSectionTitle>

      <TabOption
        active={selectedField.name}
        options={fields.map((value: Field) => {
          return {
            text: value.name,
            title: `View Media with "${selectedField.name}"`,
            onClick: () => {
              selectedField.name !== value.name && setSelectedField(value);
            },
          };
        })}
      />
    </>
  );
};

const Keypoints = ({ modal }) => {
  const [shown, setShown] = useRecoilState<boolean>(
    selectors.appConfigOption({ key: "showSkeletons", modal })
  );
  const [points, setPoints] = useRecoilState<boolean>(
    selectors.appConfigOption({ key: "multicolorKeypoints", modal })
  );

  return (
    <>
      <Checkbox
        name={"Multicolor keypoints"}
        value={points}
        setValue={(value) => setPoints(value)}
      />
      <Checkbox
        name={"Show keypoint skeletons"}
        value={shown}
        setValue={(value) => setShown(value)}
      />
    </>
  );
};

const Opacity = ({ modal }) => {
  const theme = useTheme();
  const [alpha, setAlpha] = useRecoilState(atoms.alpha(modal));

  return (
    <>
      <PopoutSectionTitle style={{ display: "flex", height: 33 }}>
        <span>Label opacity</span>
        {alpha !== atoms.DEFAULT_ALPHA && (
          <span
            onClick={() => setAlpha(atoms.DEFAULT_ALPHA)}
            style={{ cursor: "pointer", margin: "0.25rem" }}
            title={"Reset label opacity"}
          >
            <Check />
          </span>
        )}
      </PopoutSectionTitle>

      <Slider
        valueAtom={atoms.alpha(modal)}
        boundsAtom={constSelector([0, 1])}
        color={theme.brand}
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

const ImageFilter = ({ modal, filter }: { modal: boolean; filter: string }) => {
  const theme = useTheme();
  const [value, setFilter] = useRecoilState(
    atoms.imageFilters({ modal, filter })
  );

  return (
    <>
      <PopoutSectionTitle style={{ display: "flex", height: 33 }}>
        <span>Image {filter}</span>
        {value !== atoms.IMAGE_FILTERS[filter].default && (
          <span
            onClick={() => setFilter(atoms.IMAGE_FILTERS[filter].default)}
            style={{ cursor: "pointer", margin: "0.25rem" }}
            title={"Reset label opacity"}
          >
            <Check />
          </span>
        )}
      </PopoutSectionTitle>
      <Slider
        valueAtom={atoms.imageFilters({ modal, filter })}
        boundsAtom={constSelector(atoms.IMAGE_FILTERS[filter].bounds)}
        color={theme.brand}
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

const ImageFilters = ({ modal }) => {
  return (
    <>
      {Object.keys(atoms.IMAGE_FILTERS).map((filter) => (
        <ImageFilter modal={modal} filter={filter} key={filter} />
      ))}
    </>
  );
};

const SortFilterResults = ({ modal }) => {
  const [{ count, asc }, setSortFilterResults] = useRecoilState(
    atoms.sortFilterResults(modal)
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
  const isPatches = useRecoilValue(viewAtoms.isPatchesView);
  const [crop, setCrop] = useRecoilState(atoms.cropToContent(modal));

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

type OptionsProps = {
  modal: boolean;
  bounds: [number, number];
};

const Options = ({ modal, bounds }: OptionsProps) => {
  return (
    <Popout modal={modal} bounds={bounds}>
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
