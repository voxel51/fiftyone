import React, { useState, useEffect } from "react";
import { Menu } from "semantic-ui-react";

import { updateState } from "../actions/update";
import Player51 from "./Player51";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";

const InfoItem = ({ k, v }) => (
  <Menu.Item as="span">
    {k} &middot; <code>{v}</code>
  </Menu.Item>
);

const Sample = ({ dispatch, sample, port, setSelected, selected, setView }) => {
  const host = `http://127.0.0.1:${port}`;
  const src = `${host}?path=${sample.filepath}`;
  const socket = getSocket(port, "state");
  const id = sample._id.$oid;
  const s = sample;

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
    <div
      className="sample"
      style={{
        marginTop: selected[id] ? 0 : "2px",
        border: selected[id] ? "2px solid rgb(255, 109, 4)" : "none",
      }}
    >
      <Player51
        src={src}
        style={{
          width: "100%",
          position: "relative",
        }}
        sample={sample}
        onClick={() => handleClick()}
        onDoubleClick={() => setView({ visible: true, sample })}
        thumbnail={true}
      />
      <div className="sample-info">
        <Menu vertical style={{ width: "100%", height: "100%" }}>
          <Menu.Item as="span">
            ID &middot; <code>{sample._id.$oid}</code>
          </Menu.Item>
          {Object.keys(sample).map((k, i) => {
            if (s[k] && s[k]._cls === "Classification") {
              return <InfoItem k={k} v={s[k].label} />;
            } else if (k === "tags") {
              return <InfoItem k={k} v={s[k].join(" ")} />;
            }
          })}
        </Menu>
      </div>
    </div>
  );
};

export default connect(Sample);
