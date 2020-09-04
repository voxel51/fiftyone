import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

import { updateState } from "../actions/update";
import connect from "../utils/connect";
import { getSocket } from "../utils/socket";

import DropdownTag from "./Tags/DropdownTag";

const SelectionMenu = ({ port, dispatch }) => {
  const socket = getSocket(port, "state");

  const clearSelection = () => {
    // setSelected([]);
    socket.emit("clear_selection", (data) => {
      console.log("updateState", data);
      dispatch(updateState(data));
    });
  };

  return (
    <DropdownTag
      name="foo selected"
      onSelect={(item) => item.action()}
      menuItems={[{ name: "Clear selection", action: clearSelection }]}
      menuZIndex={500}
    />
  );
};

export default connect(SelectionMenu);
