import React, { useEffect, useRef, useState } from "react";
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

const ActionOptionDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem 0.25rem;
  padding: 0.25rem 0.5rem;
  font-weight: bold;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  color: ${({ theme }) => theme.fontDark};
`);

type ActionOptionProps = {
  onClick: () => void;
  text: string;
  title: string;
};

const useHighlightHover = () => {
  const [hovering, setHovering] = useState(false);
  const theme = useTheme();
  const style = useSpring({
    backgroundColor: hovering ? theme.backgroundLight : theme.backgroundDark,
    color: hovering ? theme.font : theme.fontDark,
  });

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => setHovering(false);

  return {
    style,
    onMouseEnter,
    onMouseLeave,
  };
};

const ActionOption = ({ onClick, text, title }: ActionOptionProps) => {
  const props = useHighlightHover();
  return (
    <ActionOptionDiv title={title} onClick={onClick} {...props}>
      {text}
    </ActionOptionDiv>
  );
};

const CheckboxOptionDiv = animated(styled.div`
  display: flex;
  font-weight: bold;
  cursor: pointer;
  margin: 0.25rem 0.25rem;

  & > span {
    display: flex;
    justify-content: center;
    align-content: center;
    flex-direction: column;
    cursor: inherit;
    padding-right: 0.5rem;
  }
`);

type CheckboxOptionProps = {
  onCheck: () => void;
  title: string;
  value: boolean;
  text: string;
};

const CheckboxOption = ({
  onCheck,
  value,
  text,
  title,
}: CheckboxOptionProps) => {
  const theme = useTheme();
  const props = useHighlightHover();
  return (
    <CheckboxOptionDiv onClick={onCheck} title={title} {...props}>
      <Checkbox
        checked={value}
        onChange={onCheck}
        style={{
          color: theme.brand,
          padding: "0.25rem",
          height: "2rem",
        }}
      />
      <span>{text}</span>
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
  min-width: 12rem;
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
  focused: boolean;
};

const Options = React.memo(({ checkboxes, actions, focused }: OptionsProps) => {
  const props = useSpring({
    opacity: focused ? 1 : 0,
  });
  return (
    <OptionsDiv style={props}>
      {checkboxes.map((props, key) => (
        <CheckboxOption {...props} key={`checkbox-${key}`} />
      ))}
      {actions.map((props, key) => (
        <ActionOption {...props} key={`action-${key}`} />
      ))}
    </OptionsDiv>
  );
});

const IconDiv = styled.div`
  position: absolute;
  top: 0.25rem;
  right: -0.75rem;
  height: 2rem;
  width: 2rem;

  & > svg {
    margin-top: 0.5rem;
    margin-right: 0.25rem;
    color: ${({ theme }) => theme.font};
  }
`;

type IconProps = {
  focused: boolean;
  loading: boolean;
  onClick: () => void;
};

const Icon = React.memo(({ focused, loading, onClick }: IconProps) => {
  const theme = useTheme();
  return (
    <IconDiv>
      {loading ? (
        <CircularProgress
          style={{
            color: theme.font,
            height: 16,
            width: 16,
            marginTop: "0.75rem",
          }}
        />
      ) : focused ? (
        <ArrowDropUp style={{ cursor: "pointer" }} onClick={onClick} />
      ) : (
        <ArrowDropDown style={{ cursor: "pointer" }} onClick={onClick} />
      )}
    </IconDiv>
  );
});

const TaggingContainerInput = styled.div`
  font-size: 14px;
  border-bottom: 1px ${({ theme }) => theme.brand} solid;
  margin-bottom: 0.5rem;
  margin-left: 2rem;
  position: relative;
`;

const TaggingInput = styled(AutosizeInput)`
  min-width: 8rem;
  padding-right: 1.5rem;
  & input {
    background-color: transparent;
    border: none;
    color: ${({ theme }) => theme.font};
    height: 2rem;
    margin-top: 0.4rem;
    font-size: 14px;
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

const untagDirections = (isInSelection, targetLabels) =>
  `Untag ${
    isInSelection && targetLabels
      ? "shown labels in selected samples"
      : isInSelection
      ? "selected samples"
      : targetLabels
      ? "shown labels"
      : "shown samples"
  }`;

const targetLabelsDirections = (isInSelection, untag) =>
  `${untag ? "Untag" : "Tag"} shown labels ${
    isInSelection ? "in selected samples" : ""
  }`;

const placeholderDirections = (
  isInSelection,
  numSamples,
  untag,
  targetLabels
) => {
  if (typeof numSamples !== "number") {
    return "loading...";
  }

  if (numSamples === 0) {
    return "no samples";
  }

  return `${untag ? "- untag" : "+ tag"}${
    targetLabels ? " shown labels in" : ""
  } ${numSamples}${isInSelection ? " selected" : ""}${` sample${
    numSamples > 1 ? "s" : ""
  }`}`;
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
  const count = useRecoilValue(selectors.currentCount);
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

  const disabled = tagging || typeof count !== "number" || count === 0;

  return (
    <TaggingContainerInput ref={ref}>
      <TaggingInput
        placeholder={placeholderDirections(
          isInSelection,
          isInSelection ? selectedSamples.size : count,
          untag,
          targetLabels
        )}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            setTagging(true);
            setFocused(false);
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
        disabled={disabled}
      />
      <Icon
        focused={focused}
        loading={tagging || typeof count !== "number"}
        onClick={() => setFocused(!focused)}
      />
      {focused && (
        <Options
          focused={focused}
          checkboxes={[
            {
              text: "Untag",
              onCheck: () => setUntag(!untag),
              title: untagDirections(isInSelection, targetLabels),
              value: untag,
            },
            {
              text: "Target shown labels",
              onCheck: () => setTargetLabels(!targetLabels),
              title: targetLabelsDirections(isInSelection, untag),
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
