import React, { useState, useEffect } from "react";
import Player51 from "../player51/build/cjs/player51.min.js";

import clickHandler from "../utils/click.ts";
import { getSocket } from "../utils/socket";
import connect from "../utils/connect";

const loadOverlay = (labels) => {
  const objects = [];
  for (const i in labels) {
    const label = labels[i];
    for (const j in label.detections) {
      const detection = label.detections[j];
      const bb = detection.bounding_box;
      objects.push({
        label: detection.label,
        bounding_box: {
          top_left: { x: bb[0], y: bb[1] },
          bottom_right: { x: bb[0] + bb[2], y: bb[1] + bb[3] },
        },
      });
    }
  }
  return { objects: { objects: objects } };
};

function Player51Wrapper({ sample, src, style, onClick, onDoubleClick }) {
  const overlay = loadOverlay(sample.labels);
  const id = sample._id.$oid;
  const [handleClick, handleDoubleClick] = clickHandler(onClick, onDoubleClick);
  const [player, setPlayer] = useState(
    new Player51({
      media: {
        src: src,
        type: "image/jpg",
      },
      overlay: overlay,
    })
  );
  useEffect(() => {
    player.thumbnailMode();
    player.render(id);
  }, []);
  return (
    <div
      id={id}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    />
  );
}

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
    <Player51Wrapper
      src={src}
      style={{
        width: "100%",
        position: "relative",
        border: selected[id] ? "1px solid black" : "none",
      }}
      sample={sample}
      onClick={() => handleClick()}
      onDoubleClick={() => setView({ visible: true, sample })}
    />
  );
};

export default connect(Sample);
