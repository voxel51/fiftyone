import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useFastRerender } from "../utils/hooks";
import { listSampleObjects } from "../utils/labels";
import {
  SelectedObjectMap,
  addObjectsToSelection,
  removeMatchingObjectsFromSelection,
} from "../utils/selection";

import DropdownTag from "./Tags/DropdownTag";

const SelectObjectsMenu = ({ sample, frameNumberRef }) => {
  const [selectedObjects, setSelectedObjects] = useRecoilState<
    SelectedObjectMap
  >(atoms.selectedObjects);
  const sampleFrameData =
    useRecoilValue(atoms.sampleFrameData(sample._id)) || [];
  const isVideo = useRecoilValue(selectors.mediaType) == "video";
  const frameNumber = isVideo ? frameNumberRef.current : null;

  const sampleObjects = isVideo
    ? sampleFrameData.map(listSampleObjects).flat()
    : listSampleObjects(sample);
  const frameObjects =
    isVideo && frameNumber
      ? listSampleObjects(sampleFrameData[frameNumber - 1])
      : [];

  const numTotalSelectedObjects = Object.keys(selectedObjects).length;
  const numSampleSelectedObjects = sampleObjects.filter(
    (obj) => selectedObjects[obj._id]
  ).length;
  const numFrameSelectedObjects = frameObjects.filter(
    (obj) => selectedObjects[obj._id]
  ).length;

  const _selectAll = (objects) => {
    setSelectedObjects((selection) =>
      addObjectsToSelection(
        selection,
        objects.map((obj) => ({
          object_id: obj._id,
          sample_id: sample._id,
          field: obj.name,
          frame_number: frameNumberRef.current, // todo: fix for objects from other frames
        }))
      )
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

  const refresh = useFastRerender();

  return (
    <DropdownTag
      name={`${numTotalSelectedObjects} object${
        numTotalSelectedObjects == 1 ? "" : "s"
      } selected`}
      onSelect={(item) => item.action()}
      onOpen={() => refresh()}
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
          action: () => setSelectedObjects({}),
        },
      ].filter(Boolean)}
      menuZIndex={10}
    />
  );
};

export default SelectObjectsMenu;
