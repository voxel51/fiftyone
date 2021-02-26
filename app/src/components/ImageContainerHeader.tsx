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
`;

const Button = animated(styled.div`
  cursor: pointer;
  width: 100%;
  margin-top: 3px;
  margin-left: 0;
  margin-right: 0;
  padding: 0 0.2em;
  border-radius: 2px;
  display: flex;
  height: 32px;
`);

const ButtonText = styled.div`
  padding-right: 4px;
  padding-left: 2px;
  white-space: nowrap;
  overflow-x: hidden;
  text-overflow: ellipsis;
  font-weight: bold;
  padding-top: 4px;
  letter-spacing: 0.00938em;
  line-height: 24px;
`;

const RefreshButton = () => {
  const theme = useTheme();
  const [colorSeed, setColorSeed] = useRecoilState(atoms.colorSeed);
  const [clicked, setClicked] = useState(false);
  const props = useSpring({
    backgroundColor: clicked ? theme.backgroundLight : theme.background,
    color: clicked ? theme.font : theme.fontDark,
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
    >
      <div style={{ marginTop: 4 }}>
        <Autorenew />
      </div>
      <ButtonText>Refresh field colors</ButtonText>
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
            <span
              style={{
                height: "2rem",
                padding: "0.6rem 0",
                pointerEvents: "none",
              }}
            >
              Color by label
            </span>
            <Checkbox style={{ color: theme.brand }} checked={colorByLabel} />
          </OptionContainer>
          <OptionContainer onClick={() => setColorByLabel(!colorByLabel)}>
            <RefreshButton />
          </OptionContainer>
          <div>
            <SelectionMenu />
          </div>
        </OptionsContainer>
        {countStr !== null ? (
          <div className="total" style={{ paddingRight: "1rem" }}>
            Viewing <strong>{countStr} samples</strong>
          </div>
        ) : null}
      </SamplesHeader>
    </Wrapper>
  );
};

export default ImageContainerHeader;
