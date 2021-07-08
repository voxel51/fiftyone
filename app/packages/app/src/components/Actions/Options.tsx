import React from "react";
import { useRecoilState } from "recoil";
import { Autorenew } from "@material-ui/icons";

import Popout from "./Popout";
import { PopoutSectionTitle, TabOption } from "../utils";
import * as atoms from "../../recoil/atoms";
import { Button } from "../FieldsSidebar";
import Checkbox from "../Common/Checkbox";

export const RefreshButton = ({ modal }) => {
  const [colorSeed, setColorSeed] = useRecoilState(
    atoms.colorSeed(Boolean(modal))
  );
  return (
    <>
      <PopoutSectionTitle></PopoutSectionTitle>
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
            title: "color by field",
            onClick: () => colorByLabel && setColorByLabel(false),
          },
          {
            text: "value",
            title: "color by value",
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
  console.log(count, asc);

  return (
    <>
      <PopoutSectionTitle>Sort filter results by</PopoutSectionTitle>
      <TabOption
        active={count ? "count" : "value"}
        options={[
          {
            text: "count",
            title: "sort by count",
            onClick: () => !count && setSortFilterResults({ count: true, asc }),
          },
          {
            text: "value",
            title: "sort by value",
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

type OptionsProps = {
  modal: boolean;
};

const Options = ({ modal, bounds }: OptionsProps) => {
  return (
    <Popout modal={modal} bounds={bounds}>
      <ColorBy modal={modal} />
      <RefreshButton modal={modal} />
      <SortFilterResults modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
