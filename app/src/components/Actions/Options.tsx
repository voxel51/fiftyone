import React from "react";
import { useRecoilState } from "recoil";
import { Autorenew } from "@material-ui/icons";

import Popout from "./Popout";
import { useTheme } from "../../utils/hooks";
import { PopoutSectionTitle, TabOption } from "../utils";
import * as atoms from "../../recoil/atoms";
import { Button } from "../FieldsSidebar";

export const RefreshButton = ({ modal }) => {
  const [colorSeed, setColorSeed] = useRecoilState(
    atoms.colorSeed(Boolean(modal))
  );
  const theme = useTheme();
  return (
    <>
      <PopoutSectionTitle></PopoutSectionTitle>
      <Button
        text={"Refresh colors"}
        onClick={() => setColorSeed(colorSeed + 1)}
        style={{ margin: "0.5rem 0", height: "2rem" }}
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
            text: "value",
            title: "color by value",
            onClick: () => !colorByLabel && setColorByLabel(true),
          },
          {
            text: "field",
            title: "color by field",
            onClick: () => colorByLabel && setColorByLabel(false),
          },
        ]}
      />
    </>
  );
};

type OptionsProps = {
  modal: boolean;
};

const Options = ({ modal }: OptionsProps) => {
  return (
    <Popout modal={modal}>
      <ColorBy modal={modal} />
      <RefreshButton modal={modal} />
    </Popout>
  );
};

export default React.memo(Options);
