import React, { useState } from "react";
import styled, { ThemeProvider } from "styled-components";
import { useRecoilValue } from "recoil";
import { Checkbox } from "@material-ui/core";

import DropdownHandle from "./DropdownHandle";
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
  margin-left: -1rem;
  margin-right: -1rem;
  margin-bottom: -0.5rem;
  flex-grow: 1;
`;

const OptionsContainer = styled.div`
  display: flex;
`;

const OptionTextDiv = styled.div`
  padding-right: 0.25rem;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
`;

export const OptionText = ({ style, children }) => {
  return (
    <OptionTextDiv style={style}>
      <span>{children}</span>
    </OptionTextDiv>
  );
};

const TagItemsDiv = styled.div`
  border: 1px solid #191c1f;
  box-shadow: 0 8px 15px 0 rgba(0, 0, 0, 0.43);
  border-radius: 2px;
  margin-bottom: 0.5rem;
  margin-left: 2rem;
  background: ${({ theme }) => theme.backgroundDark};
  display: flex;
`;

const StringInput = styled.input`
  width: 100%;
  font-size: 14px;
  height: 2.5rem;
  font-weight: bold;
  padding: 0.5rem;
  background: transparent;
  border: none;

  &:focus {
    outline: none;
  }
`;

const TagOptions = styled.div`
  display: flex;
`;

const CheckboxOptionDiv = styled.div`
  margin-left: -1rem;
  display: flex;
`;

type CheckboxOptionProps = {
  onCheck: () => void;
  value: boolean;
  text: string;
};

const CheckboxOption = ({ onCheck, value, text }: CheckboxOptionProps) => {
  const theme = useTheme();
  return (
    <CheckboxOptionDiv>
      <Checkbox
        checked={value}
        onChange={onCheck}
        style={{
          color: theme.brand,
        }}
      />
      {text}
    </CheckboxOptionDiv>
  );
};

const TagItems = () => {
  const [invert, setInvert] = useState(false);
  const [targetLabels, setTargetLabels] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);

  const isInSelection = selectedSamples.size > 0;

  return (
    <TagItemsDiv>
      <StringInput
        placeholder={`${invert ? "- untag" : "+ tag"} ${
          isInSelection
            ? `${selectedSamples.size} selected sample${
                selectedSamples.size > 1 ? "s" : ""
              }`
            : targetLabels
            ? "shown labels"
            : "samples"
        }`}
        value=""
      />
      <TagOptions>
        <CheckboxOption
          onCheck={() => setInvert(!invert)}
          value={invert}
          text={"remove"}
        />
        <CheckboxOption
          onCheck={() => setTargetLabels(!targetLabels)}
          value={invert}
          text={"target labels"}
        />
      </TagOptions>
    </TagItemsDiv>
  );
};

const ImageContainerHeader = ({ showSidebar, onShowSidebar }: Props) => {
  const totalCount = useRecoilValue(selectors.totalCount);
  const filteredCount = useRecoilValue(selectors.filteredCount);

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
        <TagItems />
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
