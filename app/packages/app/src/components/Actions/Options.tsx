import { Autorenew, OpacityRounded } from "@material-ui/icons";
import React from "react";
import { constSelector, useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";

import Checkbox from "../Common/Checkbox";
import { PopoutSectionTitle, TabOption } from "../utils";

import { Button } from "../FieldsSidebar";
import Popout from "./Popout";
import { Slider } from "../Filters/RangeSlider";
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
  const [colorByLabel, setColorByLabel] = useRecoilState(
    atoms.colorByLabel(modal)
  );

  return (
    <>
      <PopoutSectionTitle>Color by</PopoutSectionTitle>
      <TabOption
        active={colorByLabel ? "value" : "field"}
        options={[
          {
            text: "field",
            title: "Color by field",
            onClick: () => colorByLabel && setColorByLabel(false),
          },
          {
            text: "value",
            title: "Color by value",
            onClick: () => !colorByLabel && setColorByLabel(true),
          },
        ]}
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
            <OpacityRounded />
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
  const isPatches = useRecoilValue(selectors.isPatchesView);
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
};

const Options = ({ modal, bounds }: OptionsProps) => {
  return (
    <Popout modal={modal} bounds={bounds}>
      <ColorBy modal={modal} />
      <RefreshButton modal={modal} />
      <Opacity modal={modal} />
      <SortFilterResults modal={modal} />
      <Patches modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
