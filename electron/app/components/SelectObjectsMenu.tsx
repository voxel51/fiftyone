import React from "react";
import { useRecoilState } from "recoil";

import * as atoms from "../recoil/atoms";
import { listSampleObjects } from "../utils/labels";

import DropdownTag from "./Tags/DropdownTag";

const SelectObjectsMenu = ({ sample }) => {
  const [selectedObjects, setSelectedObjects] = useRecoilState(
    atoms.selectedObjects
  );
  const sampleObjects = listSampleObjects(sample);
  const numTotalSelectedObjects = Object.keys(selectedObjects).length;
  const numSampleObjects = sampleObjects.length;
  const numSampleSelectedObjects = Object.entries(selectedObjects).reduce(
    (acc, [objectID, sampleID]) => acc + Number(sampleID == sample._id),
    0
  );

  const selectAllInSample = () => {
    const newSelection = { ...selectedObjects };
    for (const obj of sampleObjects) {
      newSelection[obj._id] = sample._id;
    }
    setSelectedObjects(newSelection);
  };

  const unselectAllInSample = () => {
    const newSelection = { ...selectedObjects };
    for (const [objectID, sampleID] of Object.entries(selectedObjects)) {
      if (sampleID == sample._id) {
        delete newSelection[objectID];
      }
    }
    setSelectedObjects(newSelection);
  };

  return (
    <DropdownTag
      name={`${numTotalSelectedObjects} object${
        numTotalSelectedObjects == 1 ? "" : "s"
      } selected`}
      onSelect={(item) => item.action()}
      menuItems={[
        numSampleSelectedObjects < numSampleObjects && {
          name: "Select all (current sample)",
          action: () => selectAllInSample(),
        },
        numSampleSelectedObjects > 0 && {
          name: "Unselect all (current sample)",
          action: () => unselectAllInSample(),
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
