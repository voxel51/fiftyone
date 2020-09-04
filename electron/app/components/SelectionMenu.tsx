import React from "react";
import { useRecoilState } from "recoil";
import styled from "styled-components";

import { updateState } from "../actions/update";
import * as atoms from "../recoil/atoms";
import connect from "../utils/connect";
import { getSocket } from "../utils/socket";

import DropdownTag from "./Tags/DropdownTag";

const SelectionMenu = ({ port, dispatch }) => {
  const socket = getSocket(port, "state");
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    atoms.selectedSamples
  );

  const clearSelection = () => {
    setSelectedSamples(new Set());
    socket.emit("clear_selection", (data) => {
      dispatch(updateState(data));
    });
  };

  return (
    <DropdownTag
      name={selectedSamples.size + " selected"}
      onSelect={(item) => item.action()}
      menuItems={[{ name: "Clear selection", action: clearSelection }]}
      menuZIndex={500}
    />
  );
};

export default connect(SelectionMenu);
