import React, { useState, useEffect } from "react";
import { Card } from "semantic-ui-react";

import { updateState } from "../actions/update";
import Player51 from "./Player51";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";

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
    <Card>
      <Player51
        src={src}
        style={{
          width: "100%",
          position: "relative",
          border: selected[id] ? "2px solid rgb(255, 109, 4)" : "none",
        }}
        sample={sample}
        onClick={() => handleClick()}
        onDoubleClick={() => setView({ visible: true, sample })}
        thumbnail={true}
      />
      <Card.Content>
        <Card.Header>{sample._id.$oid}</Card.Header>
      </Card.Content>
    </Card>
  );
};

export default connect(Sample);
