import React, { useState } from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

import Popout from "./Popout";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";
import { listSampleObjects } from "../../utils/labels";
import * as labelAtoms from "../Filters/LabelFieldFilters.state";
import { useTheme, useSendMessage } from "../../utils/hooks";

const useHighlightHover = (disabled) => {
  const [hovering, setHovering] = useState(false);
  const theme = useTheme();
  const style = useSpring({
    backgroundColor:
      hovering && !disabled
        ? theme.backgroundLight
        : disabled
        ? theme.backgroundDarker
        : theme.backgroundDark,
    color: hovering && !disabled ? theme.font : theme.fontDark,
  });

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => setHovering(false);

  return {
    style: {
      ...style,
      cursor: disabled ? "disabled" : "pointer",
    },
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
  title?: string;
  disabled?: boolean;
};

const ActionOption = ({
  onClick,
  text,
  title,
  disabled,
}: ActionOptionProps) => {
  const props = useHighlightHover(disabled);
  if (disabled) {
    return null;
  }
  return (
    <ActionOptionDiv
      title={title ? title : text}
      onClick={disabled ? null : onClick}
      {...props}
    >
      {text}
    </ActionOptionDiv>
  );
};

const getGridActions = (close: () => void) => {
  const clearSelection = useRecoilCallback(
    ({ snapshot, set, reset }) => async () => {
      const [oldSelected, state] = await Promise.all([
        snapshot.getPromise(atoms.selectedSamples),
        snapshot.getPromise(atoms.stateDescription),
      ]);
      oldSelected.forEach((s) => reset(atoms.isSelectedSample(s)));
      const newState = JSON.parse(JSON.stringify(state));
      newState.selected = [];
      set(atoms.stateDescription, newState);
      reset(atoms.selectedSamples);
      socket.send(packageMessage("clear_selection", {}));
      close();
    },
    [close]
  );
  const addStage = useRecoilCallback(({ snapshot, set }) => async (name) => {
    close();
    const state = await snapshot.getPromise(atoms.stateDescription);
    const newState = JSON.parse(JSON.stringify(state));
    const samples = await snapshot.getPromise(atoms.selectedSamples);
    const newView = newState.view || [];
    newView.push({
      _cls: `fiftyone.core.stages.${name}`,
      kwargs: [["sample_ids", Array.from(samples)]],
    });
    newState.view = newView;
    newState.selected = [];
    socket.send(packageMessage("update", { state: newState }));
    set(atoms.stateDescription, newState);
  });

  return [
    {
      text: "Clear selected samples",
      title: "Deselect all selected samples",
      onClick: clearSelection,
    },
    {
      text: "Only show selected samples",
      title: "Hide all other samples",
      onClick: () => addStage("Select"),
    },
    {
      text: "Hide selected samples",
      title: "Show only unselected samples",
      onClick: () => addStage("Exclude"),
    },
  ];
};

const _addFrameNumberToObjects = (objects, frame_number) =>
  objects.map((obj) => ({ ...obj, frame_number }));

const getModalActions = (frameNumberRef, close) => {
  const sample = useRecoilValue(selectors.modalSample);
  const [selectedObjects, setSelectedObjects] = useRecoilState(
    selectors.selectedLabels
  );
  const filter = useRecoilValue(labelAtoms.sampleModalFilter);
  const resetSelectedObjects = useResetRecoilState(atoms.selectedObjects);
  const setHiddenObjects = useSetRecoilState(atoms.hiddenObjects);
  const hiddenObjectIds = useRecoilValue(selectors.hiddenObjectIds);

  const sampleFrameData =
    useRecoilValue(atoms.sampleFrameData(sample._id)) || [];
  const isVideo = useRecoilValue(selectors.mediaType) == "video";
  const frameNumber = isVideo ? frameNumberRef.current : null;

  useSendMessage(
    "set_selected_labels",
    { selected_labels: convertSelectedObjectsMapToList(selectedObjects) },
    null,
    [selectedObjects]
  );

  const sampleObjects = isVideo
    ? sampleFrameData
        .map(listSampleObjects)
        .filter((o) => hiddenObjectIds.has(o._id))
        .map((arr, i) => _addFrameNumberToObjects(arr, i + 1))
        .flat()
    : listSampleObjects(filter(sample));
  const frameObjects =
    isVideo && frameNumber && sampleFrameData[frameNumber - 1]
      ? _addFrameNumberToObjects(
          listSampleObjects(
            filter(sampleFrameData[frameNumber - 1], "frames.")
          ).filter((o) => !hiddenObjectIds.has(o._id)),
          frameNumber
        )
      : [];

  const numTotalSelectedObjects = Object.keys(selectedObjects).length;
  const numSampleSelectedObjects = sampleObjects.filter(
    (obj) => selectedObjects[obj._id]
  ).length;
  const numFrameSelectedObjects = frameObjects.filter(
    (obj) => selectedObjects[obj._id]
  ).length;

  const _getObjectSelectionData = (object) => ({
    label_id: object._id,
    sample_id: sample._id,
    field: object.name,
    frame_number: object.frame_number,
  });

  const _selectAll = (objects) => {
    close();
    setSelectedObjects((selection) =>
      addObjectsToSelection(selection, objects.map(_getObjectSelectionData))
    );
  };

  const selectAllInSample = () => _selectAll(sampleObjects);

  const unselectAllInSample = () => {
    close();
    setSelectedObjects((selection) =>
      removeMatchingObjectsFromSelection(selection, { sample_id: sample._id })
    );
  };

  const selectAllInFrame = () => _selectAll(frameObjects);

  const unselectAllInFrame = () => {
    close();
    setSelectedObjects((selection) =>
      removeMatchingObjectsFromSelection(selection, {
        sample_id: sample._id,
        frame_number: frameNumberRef.current,
      })
    );
  };

  const hideSelected = () => {
    close();
    const ids = Object.keys(selectedObjects);
    resetSelectedObjects();
    // can copy data directly from selectedObjects since it's in the same format
    setHiddenObjects((hiddenObjects) =>
      addObjectsToSelection(
        hiddenObjects,
        ids.map((label_id) => ({ label_id, ...selectedObjects[label_id] }))
      )
    );
  };

  const hideOthers = (objects) => {
    close();
    setHiddenObjects((hiddenObjects) =>
      addObjectsToSelection(
        hiddenObjects,
        objects
          .filter((obj) => !selectedObjects[obj._id])
          .map(_getObjectSelectionData)
      )
    );
  };
  return [
    sampleObjects.length && {
      text: "Select all (current sample)",
      disabled: numSampleSelectedObjects >= sampleObjects.length,
      onClick: () => selectAllInSample(),
    },
    sampleObjects.length && {
      text: "Unselect all (current sample)",
      disabled: !numSampleSelectedObjects,
      onClick: () => unselectAllInSample(),
    },
    frameObjects.length && {
      text: "Select all (current frame)",
      disabled: numFrameSelectedObjects >= frameObjects.length,
      onClick: () => selectAllInFrame(),
    },
    frameObjects.length && {
      text: "Unselect all (current frame)",
      disabled: !numFrameSelectedObjects,
      onClick: () => unselectAllInFrame(),
    },
    {
      text: "Clear selection",
      disabled: !numTotalSelectedObjects,
      onClick: () => {
        close();
        resetSelectedObjects();
      },
    },
    {
      text: "Hide selected",
      disabled: numTotalSelectedObjects == 0,
      onClick: () => hideSelected(),
    },
    sampleObjects.length && {
      text: "Hide others (current sample)",
      disabled: numSampleSelectedObjects == 0,
      onClick: () => hideOthers(sampleObjects),
    },
    frameObjects.length && {
      text: "Hide others (current frame)",
      disabled: numFrameSelectedObjects == 0,
      onClick: () => hideOthers(frameObjects),
    },
  ].filter(Boolean);
};

const SelectionActions = ({ modal, close, frameNumberRef, bounds }) => {
  const actions = modal
    ? getModalActions(frameNumberRef, close)
    : getGridActions(close);

  return (
    <Popout modal={modal} bounds={bounds}>
      {actions.map((props) => (
        <ActionOption {...props} />
      ))}
    </Popout>
  );
};

export default React.memo(SelectionActions);
