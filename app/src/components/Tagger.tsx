import React, { useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilState, useRecoilValue } from "recoil";
import { Checkbox, CircularProgress } from "@material-ui/core";
import { ArrowDropDown, ArrowDropUp } from "@material-ui/icons";
import AutosizeInput from "react-input-autosize";

import { useTheme } from "../utils/hooks";
import * as fieldAtoms from "./Filters/utils";
import { packageMessage } from "../utils/socket";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const TaggingContainerInput = styled.div`
  font-size: 1rem;
  border-bottom: 1px ${({ theme }) => theme.brand} solid;
  margin-bottom: 0.5rem;
  margin-left: 2rem;
  position: relative;
`;

const TaggingInput = styled(AutosizeInput)`
  min-width: 8rem;
  & input {
    background-color: transparent;
    border: none;
    color: ${({ theme }) => theme.font};
    height: 2rem;
    margin-top: 0.4rem;
    font-size: 1rem;
    border: none;
    align-items: center;
    font-weight: bold;
    width: 100%;
  }

  & input:focus {
    border: none;
    outline: none;
    font-weight: bold;
  }

  & ::placeholder {
    color: ${({ theme }) => theme.fontDark};
    font-weight: bold;
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

const OptionsDiv = animated(styled.div`
  background-color: ${({ theme }) => theme.backgroundDark};
  border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  border-radius: 2px;
  box-shadow: 0 2px 20px ${({ theme }) => theme.backgroundDark};
  box-sizing: border-box;
  margin-top: 2.5rem;
  position: fixed;
  width: auto;
  z-index: 801;
  max-height: 328px;
  overflow-y: scroll;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  &::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }
`);

const IconDiv = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  height: 2rem;
  width: 2rem;
`;

const Options = () => {};

type IconProps = {
  focued: boolean;
  tagging: boolean;
};

const Icon = React.memo(({ focused, tagging }: IconProps) => {
  const theme = useTheme();

  const style = { color: theme.font, height: 16, width: 16, minWidth: 16 };
  return (
    <IconDiv>
      {tagging ? (
        <CircularProgress style={style} />
      ) : focused ? (
        <ArrowDropUp
          style={{ cursor: "pointer", ...style }}
          onClick={() => setFocused(false)}
        />
      ) : (
        <ArrowDropDown
          style={{ cursor: "pointer", ...style }}
          onClick={() => setFocused(true)}
        />
      )}
    </IconDiv>
  );
});

type TaggerProps = {
  modal: boolean;
};

const Tagger = ({ modal }: TaggerProps) => {
  const [invert, setInvert] = useState(false);
  const [targetLabels, setTargetLabels] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const isInSelection = selectedSamples.size > 0;
  const [value, setValue] = useState("");
  const socket = useRecoilValue(selectors.socket);
  const activeLabels = useRecoilValue(fieldAtoms.activeFields(false));
  const [tagging, setTagging] = useRecoilState(atoms.tagging("grid"));
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <TaggingContainerInput>
      <TaggingInput
        placeholder={`${invert ? "- untag" : "+ tag"} ${
          isInSelection && !targetLabels
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
            setValue("");
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={tagging}
      />
    </TaggingContainerInput>
  );
};

export default React.memo(Tagger);
