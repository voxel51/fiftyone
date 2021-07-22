import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { Autorenew } from "@material-ui/icons";

import Popout from "./Popout";
import { PopoutSectionTitle, TabOption } from "../utils";
import * as atoms from "../../recoil/atoms";
import { Button } from "../FieldsSidebar";
import Checkbox from "../Common/Checkbox";
import { isPatchesView } from "../../recoil/selectors";

export const RefreshButton = ({ modal }) => {
  const [colorSeed, setColorSeed] = useRecoilState(
    atoms.colorSeed(Boolean(modal))
  );
  return (
    <>
      <Button
        text={"Refresh colors"}
        onClick={() => setColorSeed(colorSeed + 1)}
        style={{
          margin: "0.5rem -0.5rem",
          height: "2rem",
          borderRadius: 0,
        }}
      >
        <Autorenew
          style={{ height: "1.5rem", marginTop: "0.1rem", color: "inherit" }}
        />
      </Button>
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
  const isPatches = useRecoilValue(isPatchesView);
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
      <SortFilterResults modal={modal} />
      <Patches modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
