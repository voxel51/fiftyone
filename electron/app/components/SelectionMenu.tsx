import React from "react";
import { useRecoilState } from "recoil";

import { updateState } from "../actions/update";
import * as atoms from "../recoil/atoms";
import connect from "../utils/connect";
import { getSocket } from "../utils/socket";

import DropdownTag from "./Tags/DropdownTag";

const SelectionMenu = ({ port, dispatch }) => {
  const socket = getSocket(port, "state");
  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    atoms.selectedSamples
  );

  // from App.tsx - todo: refactor into action?
  const handleStateUpdate = (data) => {
    setStateDescription(data);
    setSelectedSamples(new Set(data.selected));
    dispatch(updateState(data));
  };

  const clearSelection = () => {
    setSelectedSamples(new Set());
    socket.emit("clear_selection");
  };

  const addStage = (name, callback = () => {}) => {
    const newState = JSON.parse(JSON.stringify(stateDescription));
    const newView = JSON.parse(newState.view.view);
    newView.push({
      _cls: `fiftyone.core.stages.${name}`,
      kwargs: [["sample_ids", Array.from(selectedSamples)]],
    });
    newState.view.view = JSON.stringify(newView);
    socket.emit("update", { data: newState, include_self: true }, () => {
      callback();
    });
  };

  const size = selectedSamples.size;
  if (size == 0) {
    return <span>0 samples selected</span>;
  }
  return (
    <DropdownTag
      name={`${size} sample${size == 1 ? "" : "s"} selected`}
      disabled={!size}
      title={size ? undefined : "Click on samples below to select them"}
      onSelect={(item) => item.action()}
      menuItems={[
        {
          name: "Clear selection",
          action: clearSelection,
        },
        {
          name: "Only show selected",
          action: () => addStage("Select"),
        },
        {
          name: "Hide selected",
          action: () => addStage("Exclude", clearSelection),
        },
      ]}
      menuZIndex={500}
    />
  );
};

export default connect(SelectionMenu);
