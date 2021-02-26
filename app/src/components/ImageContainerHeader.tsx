import React, { useState } from "react";
import styled from "styled-components";
import { useRecoilState, useRecoilValue } from "recoil";
import { Checkbox } from "@material-ui/core";
import { Autorenew } from "@material-ui/icons";
import { animated, useSpring } from "react-spring";

import DropdownHandle from "./DropdownHandle";
import SelectionMenu from "./SelectionMenu";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useTheme } from "../utils/hooks";

type Props = {
  showSidebar: boolean;
  onShowSidebar: (show: boolean) => void;
};

const Wrapper = styled.div`
  background: ${({ theme }) => theme.background};
  display: flex;
  margin-bottom: 0.5rem;
  flex-shrink: 0;

  ${DropdownHandle.Body} {
    width: 264px;
  }
`;

const SamplesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  overflow-x: hidden;
  margin-left: 1rem;
  margin-right: -1rem;
  flex-grow: 1;
`;

const OptionsContainer = styled.div`
  display: flex;
`;

const OptionContainer = styled.div`
  display: flex;
  justify-content: space-between;
  border-right: 1px solid #191c1f;
  color: ${({ theme }) => theme.fontDark};
  font-weight: bold;
  cursor: pointer;
  margin: 0.25rem 0;
`;

const Button = animated(styled.div`
  cursor: pointer;
  margin-left: 0;
  margin-right: 0;
  padding: 0.25rem;
  border-radius: 3px;
  display: flex;
  margin: 0 0.25rem;
`);

const OptionTextDiv = styled.div`
  padding-right: 0.25rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
`;

const OptionText = ({ style, children }) => {
  return (
    <OptionTextDiv style={style}>
      <span>{children}</span>
    </OptionTextDiv>
  );
};

const RefreshButton = () => {
  const theme = useTheme();
  const [colorSeed, setColorSeed] = useRecoilState(atoms.colorSeed);
  const [clicked, setClicked] = useState(false);
  const [hover, setHover] = useState(false);
  const props = useSpring({
    backgroundColor: clicked
      ? theme.backgroundDark
      : hover
      ? theme.backgroundLight
      : theme.background,
    onRest: () => clicked && setClicked(false),
    config: {
      duration: 250,
    },
  });
  return (
    <Button
      style={props}
      onClick={() => {
        setColorSeed(colorSeed + 1);
        setClicked(true);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <OptionText>Refresh field colors</OptionText>
      <Autorenew style={{ marginTop: 3, height: "1.5rem" }} />
    </Button>
  );
};

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const totalCount = useRecoilValue(selectors.totalCount);
  const filteredCount = useRecoilValue(selectors.filteredCount);
  const [colorByLabel, setColorByLabel] = useRecoilState(atoms.colorByLabel);
  const theme = useTheme();
  let countStr = null;
  if (
    typeof filteredCount === "number" &&
    filteredCount !== totalCount &&
    typeof totalCount === "number"
  ) {
    countStr = `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`;
  } else if (typeof totalCount === "number") {
    countStr = totalCount.toLocaleString();
  }
  return (
    <Wrapper>
      <DropdownHandle
        label="Fields"
        expanded={showSidebar}
        onClick={onShowSidebar && (() => onShowSidebar(!showSidebar))}
        style={{ width: 240 }}
      />
      <SamplesHeader>
        <OptionsContainer>
          <OptionContainer onClick={() => setColorByLabel(!colorByLabel)}>
            <OptionText>Color by label</OptionText>
            <Checkbox
              style={{ color: theme.brand, padding: "0 0.25rem" }}
              checked={colorByLabel}
            />
          </OptionContainer>
          <OptionContainer>
            <RefreshButton />
          </OptionContainer>
          <OptionText style={{ marginLeft: "0.25rem" }}>
            <SelectionMenu />
          </OptionText>
        </OptionsContainer>
        {countStr !== null ? (
          <OptionTextDiv>
            <div className="total" style={{ paddingRight: "1rem" }}>
              Viewing <strong>{countStr} samples</strong>
            </div>
          </OptionTextDiv>
        ) : null}
      </SamplesHeader>
    </Wrapper>
  );
};

export default ImageContainerHeader;
