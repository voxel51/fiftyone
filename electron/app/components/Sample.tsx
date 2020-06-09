import React, { useState, useEffect } from "react";
import { Menu } from "semantic-ui-react";

import { updateState } from "../actions/update";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";
import { isFloat } from "../utils/generic";
import Player51 from "./Player51";
import Tag from "./Tag";

const Sample = ({
  displayProps,
  dispatch,
  sample,
  port,
  setSelected,
  selected,
  setView,
  width,
}) => {
  const s = sample;
  const host = `http://127.0.0.1:${port}`;
  const id = s._id.$oid;
  const src = `${host}?path=${s.filepath}&id=${id}`;
  const socket = getSocket(port, "state");

  const { activeLabels, activeTags, activeScalars } = displayProps;

  const isFloat = (n) => {
    return Number(n) === n && n % 1 !== 0;
  };

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
    <div className="sample" style={{ width: `${width}%` }}>
      <Player51
        src={src}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
        }}
        colors={colors}
        sample={sample}
        onClick={() => handleClick()}
        onDoubleClick={() => setView({ visible: true, sample })}
        thumbnail={true}
        activeLabels={activeLabels}
      />
      <div className="sample-info">
        {Object.keys(s).map((f, i) => {
          return activeLabels[f] && s[f] && s[f].cls === "Classification" ? (
            <Tag key={i} name={String(s[f].label)} color={activeLabels[f]} />
          ) : null;
        })}
        {s.tags.map((t, i) => {
          return activeTags[t] ? (
            <Tag key={i} name={String(t)} color={activeTags[t]} />
          ) : null;
        })}
        {Object.keys(s).map((l, i) => {
          return activeScalars[l] && (s[l] || typeof s[l] === "boolean") ? (
            <Tag
              key={i}
              name={String(isFloat(s[l]) ? s[l].toFixed(3) : s[l])}
              color={activeScalars[l]}
            />
          ) : null;
        })}
      </div>
      {selected[id] ? (
        <div
          style={{
            border: "2px solid rgb(255, 109, 4)",
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
          }}
        />
      ) : null}
    </div>
  );
};

export default connect(Sample);
