import React from "react";
import styled from "styled-components";
import { useRecoilState, useRecoilValue } from "recoil";
import { Checkbox } from "@material-ui/core";

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
  height: 45px;
  overflow-x: hidden;
  margin-left: 1rem;
  margin-right: -1rem;
  padding: 0.5rem 0;
  flex-grow: 1;
`;

const OptionsContainer = styled.div`
  display: flex;
`;

const OptionContainer = styled.div`
  display: flex;
  justify-content: space-between;
  background: ${({ theme }) => theme.backgroundDark};
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  font-weight: bold;
  cursor: pointer;
`;

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
          <SelectionMenu />
          <OptionContainer onClick={() => setColorByLabel(!colorByLabel)}>
            <span style={{ height: "2rem", padding: "0.5rem" }}>
              Color by label
            </span>
            <Checkbox style={{ color: theme.brand }} checked={colorByLabel} />
          </OptionContainer>
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
