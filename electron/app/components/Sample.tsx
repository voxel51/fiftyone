import React, { useState, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { Menu } from "semantic-ui-react";

import { updateState } from "../actions/update";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";
import { isFloat } from "../utils/generic";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import * as selectors from "../recoil/selectors";

const Sample = ({
  displayProps,
  dispatch,
  sample,
  port,
  setSelected,
  selected,
  setView,
}) => {
  const host = `http://127.0.0.1:${port}`;
  const id = sample._id.$oid;
  const src = `${host}?path=${sample.filepath}&id=${id}`;
  const socket = getSocket(port, "state");
  const s = sample;
  const { activeLabels, activeTags, activeOther, colors } = displayProps;
  const colorMapping = useRecoilValue(selectors.labelColorMapping);

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
  const eventHandlers = {
    onClick: () => handleClick(),
    onDoubleClick: () => setView({ visible: true, sample }),
  };

  return (
    <div className="sample">
      <Player51
        src={src}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
        }}
        colors={colors}
        sample={sample}
        thumbnail={true}
        activeLabels={activeLabels}
        {...eventHandlers}
      />
      <div className="sample-info" {...eventHandlers}>
        {Object.keys(s)
          .sort()
          .map((l, i) => {
            return activeLabels[l] && s[l] && s[l]._cls === "Classification" ? (
              <Tag key={i} name={String(s[l].label)} color={colors[i]} />
            ) : null;
          })}
        {s.tags.map((t, i) => {
          return activeTags[t] ? (
            <Tag key={i} name={String(t)} color={colorMapping[t]} />
          ) : null;
        })}
        {Object.keys(s)
          .sort()
          .map((l, i) => {
            return activeOther[l] && (s[l] || typeof s[l] === "boolean") ? (
              <Tag
                key={i}
                name={String(isFloat(s[l]) ? s[l].toFixed(3) : s[l])}
                color={colors[i]}
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
