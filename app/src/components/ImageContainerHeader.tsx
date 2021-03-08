import React, { useState } from "react";
import styled from "styled-components";
import { useRecoilState, useRecoilValue } from "recoil";
import { Checkbox, CircularProgress } from "@material-ui/core";

import DropdownHandle from "./DropdownHandle";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useTheme } from "../utils/hooks";
import * as fieldAtoms from "./Filters/utils";
import { packageMessage } from "../utils/socket";

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
  padding-right: 0.5rem;
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
  display: flex;
  font-weight: bold;
  line-height: 3;
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
  const [value, setValue] = useState("");
  const socket = useRecoilValue(selectors.socket);
  const activeLabels = useRecoilValue(fieldAtoms.activeFields(false));
  const [tagging, setTagging] = useRecoilState(atoms.tagging("grid"));
  const theme = useTheme();

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
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            setTagging(true);
            socket.send(
              packageMessage("tag", {
                untag: invert,
                target_labels: targetLabels,
                selected: isInSelection,
                active_labels: activeLabels,
                tag: value,
              })
            );
          }
        }}
      />
      {tagging && (
        <CircularProgress
          style={{
            color: theme.font,
            height: 16,
            width: 16,
            minWidth: 16,
          }}
        />
      )}
      <TagOptions>
        <CheckboxOption
          onCheck={() => setInvert(!invert)}
          value={invert}
          text={"remove"}
        />
        <CheckboxOption
          onCheck={() => setTargetLabels(!targetLabels)}
          value={targetLabels}
          text={"labels"}
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
