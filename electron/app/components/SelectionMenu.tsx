import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { packageMessage } from "../utils/socket";

import DropdownTag from "./Tags/DropdownTag";

const SelectionMenu = () => {
  const socket = useRecoilValue(selectors.socket);
  const stateDescription = useRecoilValue(atoms.stateDescription);
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    atoms.selectedSamples
  );

  const clearSelection = () => {
    setSelectedSamples(new Set());
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
    socket.send(packageMessage("update", { state: newState }));
  };

  const size = selectedSamples.size;
  if (size == 0) {
    return (
      <span title="Click on samples below to select them">
        0 samples selected
      </span>
    );
  }
  return (
    <DropdownTag
      name={`${size} sample${size == 1 ? "" : "s"} selected`}
      disabled={!size}
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

export default SelectionMenu;
