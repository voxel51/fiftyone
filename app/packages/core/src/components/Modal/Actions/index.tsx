import { OperatorPlacements, types } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import React, { useMemo } from "react";
import Draggable from "react-draggable";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import BrowseOperations from "../../Actions/BrowseOperations";
import ColorScheme from "../../Actions/ColorScheme";
import Options from "../../Actions/Options";
import Selected from "../../Actions/Selected";
import Similarity from "../../Actions/Similarity";
import Tag from "../../Actions/Tag";
import ToggleSidebar from "../../Actions/ToggleSidebar";
import { useModalContext } from "../hooks";
import GroupVisibility from "./GroupVisibility";
import HiddenLabels from "./HiddenLabels";
import ToggleFullscreen from "./ToggleFullscreen";

const MODAL_ACTION_BAR_HANDLE_CLASS = "fo-modal-action-bar-handle";

const Container = styled.div`
  z-index: 100001;
  position: fixed;
  right: 3em;
  top: 0.16em;
  display: flex;
  row-gap: 0.5rem;
  column-gap: 0.5rem;
  align-items: center;
  opacity: 0.8;
  transition: opacity 0.1s ease-in;

  &:hover {
    opacity: 1;
    transition: opacity 0.1s ease-out;
  }

  svg {
    font-size: 18px;
  }

  > div {
    max-height: 24px;

    > div:first-child {
      max-height: 24px;
    }
  }
`;

const DraggableHandleIconContainer = styled.div`
  cursor: grab;
  display: flex;
  justify-content: center;
  align-items: center;

  &:active {
    cursor: grabbing;
  }
`;

const DragActionsRow = () => {
  return (
    <DraggableHandleIconContainer className={MODAL_ACTION_BAR_HANDLE_CLASS}>
      <DragIndicatorIcon />
    </DraggableHandleIconContainer>
  );
};

export default () => {
  const { activeLookerRef } = useModalContext();

  const isActualGroup = useRecoilValue(fos.isGroup);
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);

  const isGroup = useMemo(
    () => isActualGroup || isDynamicGroup,
    [isActualGroup, isDynamicGroup]
  );

  const [defaultXCoord, setDefaultXCoord] = fos.useBrowserStorage<number>(
    "modal-actions-row-x-coord",
    0,
    false
  );

  return (
    <Draggable
      handle={`.${MODAL_ACTION_BAR_HANDLE_CLASS}`}
      axis="x"
      defaultPosition={{ x: defaultXCoord ?? 0, y: 0 }}
      onDrag={(_e, { x }) => {
        setDefaultXCoord(x);
      }}
    >
      <Container>
        <DragActionsRow />
        <HiddenLabels modal />
        <Selected modal lookerRef={activeLookerRef} />
        <ColorScheme modal />
        <Similarity modal />
        <Tag modal lookerRef={activeLookerRef} />
        <Options modal />
        {isGroup && <GroupVisibility />}
        <BrowseOperations modal />
        <OperatorPlacements modal place={types.Places.SAMPLES_VIEWER_ACTIONS} />
        <ToggleFullscreen />
        <ToggleSidebar modal />
      </Container>
    </Draggable>
  );
};
