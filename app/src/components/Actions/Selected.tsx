import React, { useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { PopoutDiv } from "../utils";
import { packageMessage } from "../../utils/socket";
import { useTheme } from "../../utils/hooks";

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

const ActionOptionDiv = animated(styled.div`
  cursor: pointer;
  margin: 0.25rem -0.5rem;
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

const ActionOption = ({ onClick, text, title }: ActionOptionProps) => {
  const props = useHighlightHover();
  return (
    <ActionOptionDiv title={title} onClick={onClick} {...props}>
      {text}
    </ActionOptionDiv>
  );
};

const SelectionActions = ({ modal, close }) => {
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    atoms.selectedSamples
  );
  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );
  const socket = useRecoilValue(selectors.socket);

  const clearSelection = () => {
    setSelectedSamples(new Set());
    const newState = JSON.parse(JSON.stringify(stateDescription));
    newState.selected = [];
    setStateDescription(newState);
    socket.send(packageMessage("clear_selection", {}));
    close();
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
    close();
    callback();
  };
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
      {[
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
      ].map((props) => (
        <ActionOption {...props} />
      ))}
    </PopoutDiv>
  );
};

export default React.memo(SelectionActions);
