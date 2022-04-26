import React from "react";
import {
  Autorenew,
  Check,
  Close,
  OpacityRounded,
  Restore,
} from "@material-ui/icons";
import {
  constSelector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import * as atoms from "../../recoil/atoms";
import * as viewAtoms from "../../recoil/view";

import Checkbox from "../Common/Checkbox";
import { PopoutSectionTitle, TabOption } from "../utils";

import { Button } from "../utils";
import Popout from "./Popout";
import { Slider } from "../Common/RangeSlider";
import { useTheme } from "../../utils/hooks";

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
    selectors.appConfigOption({ modal, key: "color_by" })
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
    selectors.appConfigOption({ key: "show_skeletons", modal })
  );
  const [points, setPoints] = useRecoilState<boolean>(
    selectors.appConfigOption({ key: "color_keypoint_points", modal })
  );

  return (
    <>
      <Checkbox
        name={"Color keypoint points"}
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
      <SortFilterResults modal={modal} />
      <Patches modal={modal} />
      <ColorBy modal={modal} />
      <RefreshButton modal={modal} />
      <Opacity modal={modal} />
      <Keypoints modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
