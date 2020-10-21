import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useFastRerender } from "../utils/hooks";
import { listSampleObjects } from "../utils/labels";

import DropdownTag from "./Tags/DropdownTag";

const SelectObjectsMenu = ({ sample, frameNumberRef }) => {
  const [selectedObjects, setSelectedObjects] = useRecoilState(
    atoms.selectedObjects
  );
  const sampleFrameData =
    useRecoilValue(atoms.sampleFrameData(sample._id)) || [];
  const isVideo = useRecoilValue(selectors.mediaType) == "video";
  const frameNumber = isVideo ? frameNumberRef.current : null;

  const sampleObjects = !isVideo
    ? listSampleObjects(sample)
    : sampleFrameData.map(listSampleObjects).flat();
  const frameObjects = !isVideo
    ? []
    : listSampleObjects(sampleFrameData[frameNumber - 1]);

  const numTotalSelectedObjects = Object.keys(selectedObjects).length;
  const numSampleSelectedObjects = sampleObjects.filter(
    (obj) => selectedObjects[obj._id]
  ).length;
  const numFrameSelectedObjects = frameObjects.filter(
    (obj) => selectedObjects[obj._id]
  ).length;

  const _selectAll = (objects) => {
    const newSelection = { ...selectedObjects };
    for (const obj of objects) {
      newSelection[obj._id] = sample._id;
    }
    setSelectedObjects(newSelection);
  };

  const selectAllInSample = () => _selectAll(sampleObjects);

  const unselectAllInSample = () => {
    const newSelection = { ...selectedObjects };
    for (const [objectID, sampleID] of Object.entries(selectedObjects)) {
      if (sampleID == sample._id) {
        delete newSelection[objectID];
      }
    }
    setSelectedObjects(newSelection);
  };

  const selectAllInFrame = () => _selectAll(frameObjects);

  const unselectAllInFrame = () => {
    const newSelection = { ...selectedObjects };
    for (const obj of frameObjects) {
      delete newSelection[obj._id];
    }
    setSelectedObjects(newSelection);
  };

  const refresh = useFastRerender();

  return (
    <DropdownTag
      name={`${numTotalSelectedObjects} object${
        numTotalSelectedObjects == 1 ? "" : "s"
      } selected`}
      onSelect={(item) => item.action()}
      onOpen={() => refresh()}
      menuItems={[
        numSampleSelectedObjects < sampleObjects.length && {
          name: "Select all (current sample)",
          action: () => selectAllInSample(),
        },
        numSampleSelectedObjects > 0 && {
          name: "Unselect all (current sample)",
          action: () => unselectAllInSample(),
        },
        numFrameSelectedObjects < frameObjects.length && {
          name: "Select all (current frame)",
          action: () => selectAllInFrame(),
        },
        numFrameSelectedObjects > 0 && {
          name: "Unselect all (current frame)",
          action: () => unselectAllInFrame(),
        },
        numTotalSelectedObjects && {
          name: "Clear selection",
          action: () => setSelectedObjects({}),
        },
      ].filter(Boolean)}
      menuZIndex={10}
    />
  );
};

export default SelectObjectsMenu;
