import React from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useSendMessage } from "../utils/hooks";
import { listSampleObjects } from "../utils/labels";
import {
  SelectedObjectMap,
  addObjectsToSelection,
  removeMatchingObjectsFromSelection,
  convertSelectedObjectsMapToList,
} from "../utils/selection";

import Menu from "./Menu";
import DropdownTag from "./Tags/DropdownTag";

const _addFrameNumberToObjects = (objects, frame_number) =>
  objects.map((obj) => ({ ...obj, frame_number }));

const SelectLabelsMenu = ({ sample, frameNumberRef }) => {
  const [selectedObjects, setSelectedObjects] = useRecoilState<
    SelectedObjectMap
  >(atoms.selectedObjects);
  const resetSelectedObjects = useResetRecoilState(atoms.selectedObjects);
  const [hiddenObjects, setHiddenObjects] = useRecoilState(atoms.hiddenObjects);
  const resetHiddenObjects = useResetRecoilState(atoms.hiddenObjects);

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
        .map((arr, i) => _addFrameNumberToObjects(arr, i + 1))
        .flat()
    : listSampleObjects(sample);
  const frameObjects =
    isVideo && frameNumber && sampleFrameData[frameNumber - 1]
      ? _addFrameNumberToObjects(
          listSampleObjects(sampleFrameData[frameNumber - 1]),
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
    setSelectedObjects((selection) =>
      addObjectsToSelection(selection, objects.map(_getObjectSelectionData))
    );
  };

  const selectAllInSample = () => _selectAll(sampleObjects);

  const unselectAllInSample = () =>
    setSelectedObjects((selection) =>
      removeMatchingObjectsFromSelection(selection, { sample_id: sample._id })
    );

  const selectAllInFrame = () => _selectAll(frameObjects);

  const unselectAllInFrame = () =>
    setSelectedObjects((selection) =>
      removeMatchingObjectsFromSelection(selection, {
        sample_id: sample._id,
        frame_number: frameNumberRef.current,
      })
    );

  const hideSelected = () => {
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
    setHiddenObjects((hiddenObjects) =>
      addObjectsToSelection(
        hiddenObjects,
        objects
          .filter((obj) => !selectedObjects[obj._id])
          .map(_getObjectSelectionData)
      )
    );
  };

  return (
    <DropdownTag
      name={`${numTotalSelectedObjects} label${
        numTotalSelectedObjects == 1 ? "" : "s"
      } selected`}
      onSelect={(item) => item.action()}
      title="Click on objects in the media viewer to select them"
      menuItems={[
        sampleObjects.length && {
          name: "Select all (current sample)",
          disabled: numSampleSelectedObjects >= sampleObjects.length,
          action: () => selectAllInSample(),
        },
        sampleObjects.length && {
          name: "Unselect all (current sample)",
          disabled: !numSampleSelectedObjects,
          action: () => unselectAllInSample(),
        },
        frameObjects.length && {
          name: "Select all (current frame)",
          disabled: numFrameSelectedObjects >= frameObjects.length,
          action: () => selectAllInFrame(),
        },
        frameObjects.length && {
          name: "Unselect all (current frame)",
          disabled: !numFrameSelectedObjects,
          action: () => unselectAllInFrame(),
        },
        {
          name: "Clear selection",
          disabled: !numTotalSelectedObjects,
          action: () => resetSelectedObjects(),
        },
        Menu.DIVIDER,
        {
          name: "Hide selected",
          disabled: numTotalSelectedObjects == 0,
          action: () => hideSelected(),
        },
        sampleObjects.length && {
          name: "Hide others (current sample)",
          disabled: numSampleSelectedObjects == 0,
          action: () => hideOthers(sampleObjects),
        },
        frameObjects.length && {
          name: "Hide others (current frame)",
          disabled: numFrameSelectedObjects == 0,
          action: () => hideOthers(frameObjects),
        },
        {
          name: "Show all labels",
          disabled: hiddenObjects.size == 0,
          action: () => resetHiddenObjects(),
        },
      ].filter(Boolean)}
      menuZIndex={10}
    />
  );
};

export default SelectLabelsMenu;
