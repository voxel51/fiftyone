import React from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import styled from "styled-components";

import { updateState } from "../actions/update";
import * as atoms from "../recoil/atoms";
import connect from "../utils/connect";
import { getSocket } from "../utils/socket";

import DropdownTag from "./Tags/DropdownTag";

const SelectionMenu = ({ port, dispatch }) => {
  const socket = getSocket(port, "state");
  const setStateDescription = useSetRecoilState(atoms.stateDescription);
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

  const sendEvent = (event) => {
    socket.emit(event, handleStateUpdate);
  };

  return (
    <DropdownTag
      name={selectedSamples.size + " selected"}
      onSelect={(item) => item.action()}
      menuItems={[
        {
          name: "Clear selection",
          action: clearSelection,
        },
        {
          name: "Only show selected",
          action: () => sendEvent("select_selected"),
        },
        {
          name: "Hide selected",
          action: () => sendEvent("exclude_selected"),
        },
      ]}
      menuZIndex={500}
    />
  );
};

export default connect(SelectionMenu);
