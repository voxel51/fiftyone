import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useFastRerender } from "../utils/hooks";
import { listSampleObjects } from "../utils/labels";
import {
  SelectedObjectMap,
  addObjectsToSelection,
  removeMatchingObjectsFromSelection,
  convertSelectedObjectsMapToList,
} from "../utils/selection";
import { getSocket } from "../utils/socket";

import Menu from "./Menu";
import DropdownTag from "./Tags/DropdownTag";

const _addFrameNumberToObjects = (objects, frame_number) =>
  objects.map((obj) => ({ ...obj, frame_number }));

const SelectObjectsMenu = ({ sample, frameNumberRef }) => {
  const [selectedObjects, setSelectedObjects] = useRecoilState<
    SelectedObjectMap
  >(atoms.selectedObjects);
  const [hiddenObjects, setHiddenObjects] = useRecoilState<Set<string>>(
    atoms.hiddenObjects
  );
  const sampleFrameData =
    useRecoilValue(atoms.sampleFrameData(sample._id)) || [];
  const isVideo = useRecoilValue(selectors.mediaType) == "video";
  const frameNumber = isVideo ? frameNumberRef.current : null;

  const socket = getSocket(useRecoilValue(atoms.port), "state");
  useEffect(() => {
    socket.emit(
      "set_selected_objects",
      convertSelectedObjectsMapToList(selectedObjects)
    );
  }, [selectedObjects]);

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

  const _selectAll = (objects) => {
    setSelectedObjects((selection) =>
      addObjectsToSelection(
        selection,
        objects.map((obj) => ({
          object_id: obj._id,
          sample_id: sample._id,
          field: obj.name,
          frame_number: obj.frame_number,
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

  const hideSelected = () => {
    const ids = Object.keys(selectedObjects);
    setSelectedObjects({});
    setHiddenObjects((hiddenObjects) => {
      const newHidden = new Set(hiddenObjects);
      for (const id of ids) {
        newHidden.add(id);
      }
      return newHidden;
    });
  };

  const hideOthers = (objects) => {
    setHiddenObjects((hiddenObjects) => {
      const newHidden = new Set(hiddenObjects);
      for (const obj of objects) {
        if (!selectedObjects[obj._id]) {
          newHidden.add(obj._id);
        }
      }
      return newHidden;
    });
  };

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
          name: "Show all objects",
          disabled: hiddenObjects.size == 0,
          action: () => setHiddenObjects(new Set()),
        },
      ].filter(Boolean)}
      menuZIndex={10}
    />
  );
};

export default SelectObjectsMenu;
