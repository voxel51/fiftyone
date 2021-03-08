import React, { useRef, useState } from "react";
import styled from "styled-components";
import { animated, useSpring } from "react-spring";
import { useRecoilState, useRecoilValue } from "recoil";
import { Checkbox, CircularProgress } from "@material-ui/core";
import { ArrowDropDown, ArrowDropUp } from "@material-ui/icons";
import AutosizeInput from "react-input-autosize";

import { useOutsideClick, useTheme } from "../utils/hooks";
import * as fieldAtoms from "./Filters/utils";
import { packageMessage } from "../utils/socket";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const ActionOptionDiv = styled.div``;

type ActionOptionProps = {
  onClick: () => void;
  text: string;
  title: string;
};

const ActionOption = ({ onClick, text, title }: ActionOptionProps) => {
  return (
    <ActionOptionDiv title={title} onClick={onClick}>
      {text}
    </ActionOptionDiv>
  );
};

const CheckboxOptionDiv = styled.div`
  display: flex;
  font-weight: bold;
  line-height: 3;
`;

type CheckboxOptionProps = {
  onCheck: () => void;
  title: string;
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
  margin-top: 0.6rem;
  position: fixed;
  width: auto;
  z-index: 801;
  max-height: 328px;
  overflow-y: scroll;
  scrollbar-width: none;
  width: 12rem;
  font-size: 14px;

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

type OptionsProps = {
  checkboxes: Array<CheckboxOptionProps>;
  actions: Array<ActionOptionProps>;
};

const Options = ({ checkboxes, actions }: OptionsProps) => {
  return (
    <OptionsDiv>
      {checkboxes.map((props, key) => (
        <CheckboxOption {...props} key={`checkbox-${key}`} />
      ))}
      {actions.map((props, key) => (
        <ActionOption {...props} key={`action-${key}`} />
      ))}
    </OptionsDiv>
  );
};

const IconDiv = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  height: 2rem;
  width: 2rem;
`;

type IconProps = {
  focused: boolean;
  tagging: boolean;
  onClick: () => void;
};

const Icon = React.memo(({ focused, tagging, onClick }: IconProps) => {
  const theme = useTheme();

  const style = { color: theme.font, height: 16, width: 16, minWidth: 16 };
  return (
    <IconDiv>
      {tagging ? (
        <CircularProgress style={style} />
      ) : focused ? (
        <ArrowDropUp
          style={{ cursor: "pointer", ...style }}
          onClick={onClick}
        />
      ) : (
        <ArrowDropDown
          style={{ cursor: "pointer", ...style }}
          onClick={onClick}
        />
      )}
    </IconDiv>
  );
});

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

type TaggerProps = {
  modal: boolean;
};

const Tagger = ({ modal }: TaggerProps) => {
  const [untag, setUntag] = useState(false);
  const [targetLabels, setTargetLabels] = useState(false);
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    atoms.selectedSamples
  );
  const isInSelection = selectedSamples.size > 0;
  const [value, setValue] = useState("");
  const socket = useRecoilValue(selectors.socket);
  const activeLabels = useRecoilValue(fieldAtoms.activeFields(false));
  const [tagging, setTagging] = useRecoilState(atoms.tagging("grid"));
  const [focused, setFocused] = useState(false);

  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );
  const ref = useRef();
  useOutsideClick(ref, () => setFocused(false));

  const clearSelection = () => {
    setSelectedSamples(new Set());
    const newState = JSON.parse(JSON.stringify(stateDescription));
    newState.selected = [];
    setStateDescription(newState);
    socket.send(packageMessage("clear_selection", {}));
  };

  const addStage = (name, callback = () => {}) => {
    const newState = JSON.parse(JSON.stringify(stateDescription));
    const newView = newState.view || [];
    newView.push({
      _cls: `fiftyone.core.stages.${name}`,
      kwargs: [["sample_ids", Array.from(selectedSamples)]],
    });
    newState.view = newView;
    newState.selected = [];
    socket.send(packageMessage("update", { state: newState }));
    setStateDescription(newState);
    callback();
  };

  return (
    <TaggingContainerInput ref={ref}>
      <TaggingInput
        placeholder={`${untag ? "- untag" : "+ tag"} ${
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
                untag,
                target_labels: targetLabels,
                selected: isInSelection,
                active_labels: activeLabels,
                tag: value,
              })
            );
          }
        }}
        onFocus={() => setFocused(true)}
        disabled={tagging}
      />
      <Icon
        focused={focused}
        tagging={tagging}
        onClick={() => setFocused(!focused)}
      />
      {focused && (
        <Options
          checkboxes={[
            {
              text: "untag",
              onCheck: () => setUntag(!untag),
              title: "title",
              value: untag,
            },
            {
              text: "labels",
              onCheck: () => setTargetLabels(!targetLabels),
              title: "labels",
              value: targetLabels,
            },
          ]}
          actions={
            isInSelection
              ? [
                  {
                    text: "Clear selected samples",
                    title: "Deselect all selected samples",
                    onClick: clearSelection,
                  },
                  {
                    text: "Only show selected samples",
                    title: "Hide all other samples",
                    onClick: () => addStage("Select", clearSelection),
                  },
                  {
                    text: "Hide selected samples",
                    title: "Show only unselected samples",
                    onClick: () => addStage("Exclude", clearSelection),
                  },
                ]
              : []
          }
        />
      )}
    </TaggingContainerInput>
  );
};

export default React.memo(Tagger);
