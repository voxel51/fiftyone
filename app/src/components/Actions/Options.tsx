import React from "react";
import { useRecoilState } from "recoil";
import styled from "styled-components";
import { Autorenew } from "@material-ui/icons";
import { useSpring } from "react-spring";

import { useTheme } from "../../utils/hooks";
import { PopoutDiv, PopoutSectionTitle, TabOption } from "../utils";
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
        <Autorenew style={{ height: "1.5rem", color: "inherit" }} />
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
  const show = useSpring({
    opacity: 1,
    from: {
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  });
  return (
    <PopoutDiv style={show}>
      <ColorBy modal={modal} />
      <RefreshButton modal={modal} />
    </PopoutDiv>
  );
};

export default React.memo(Options);
