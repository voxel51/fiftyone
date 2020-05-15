import React, { useState, useEffect } from "react";
import Player51 from "../player51/build/cjs/player51.min.js";

import clickHandler from "../utils/click.ts";

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

export default ({ thumbnail, sample, src, style, onClick, onDoubleClick }) => {
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
    if (thumbnail) {
      player.thumbnailMode();
    }
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
};
