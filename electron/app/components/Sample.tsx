import React, { useState, useEffect } from "react";
import { Menu } from "semantic-ui-react";

import { updateState } from "../actions/update";
import InfoItem from "./InfoItem";
import Player51 from "./Player51";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";

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
          <InfoItem k="id" v={s._id.$oid} />
          <InfoItem k="filepath" v={s.filepath} />
          <InfoItem k="tags" v={JSON.stringify(s.tags, 2)} />
          <InfoItem k="metadata" v={JSON.stringify(s.metadata, 2)} />
          {Object.keys(s).map((k, i) => {
            if (s[k] && s[k]._cls === "Classification") {
              return <InfoItem key={i} k={k} v={s[k].label} />;
            } else if (s[k] && s[k]._cls === "Detections") {
              const l = s[k].detections.length;
              return (
                <InfoItem
                  key={i}
                  k={k}
                  v={`${l} detection${l === 1 ? "" : "s"}`}
                />
              );
            }
          })}
        </Menu>
      </div>
    </div>
  );
};

export default connect(Sample);
