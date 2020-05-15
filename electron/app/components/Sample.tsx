import React, { useState, useEffect } from "react";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";
import Player51 from "./Player51";

const Sample = ({ dispatch, sample, port, setSelected, selected, setView }) => {
  const host = `http://127.0.0.1:${port}`;
  const src = `${host}?path=${sample.filepath}`;
  const socket = getSocket(port, "state");
  const id = sample._id.$oid;

  const handleClick = () => {
    const newSelected = { ...selected };
    const event = newSelected[id] ? "remove_selection" : "add_selection";
    newSelected[id] = newSelected[id] ? false : true;
    setSelected(newSelected);
    socket.emit(event, id, (data) => {
      dispatch(updateState(data));
    });
  };

  return (
    <Player51
      src={src}
      style={{
        width: "100%",
        position: "relative",
        border: selected[id] ? "1px solid black" : "none",
      }}
      sample={sample}
      onClick={() => handleClick()}
      onDoubleClick={() => setView({ visible: true, sample })}
      thumbnail={true}
    />
  );
};

export default connect(Sample);
