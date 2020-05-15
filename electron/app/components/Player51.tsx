import React, { useState, useEffect } from "react";
import Player51 from "../player51/build/cjs/player51.min.js";

import clickHandler from "../utils/click.ts";

const PARSERS = {
  ODMClassificationLabel: [
    "attrs",
    (name, obj) => {
      return {
        type: "eta.core.data.CategoricalAttribute",
        name: name,
        confidence: obj.confidence,
        value: obj.label,
      };
    },
  ],
  ODMDetectionLabels: [
    "objects",
    (g, obj) => {
      const bb = obj.bounding_box;
      return {
        type: "eta.core.objects.DetectedObject",
        label: `${g}:${obj.label}`,
        confidence: obj.confidence,
        bounding_box: {
          top_left: { x: bb[0], y: bb[1] },
          bottom_right: { x: bb[0] + bb[2], y: bb[1] + bb[3] },
        },
      };
    },
  ],
};

const loadOverlay = (labels) => {
  const imgLabels = { attrs: { attrs: [] }, objects: { objects: [] } };
  for (const i in labels) {
    const label = labels[i];
    if (label._cls === "ODMDetectionLabels") {
      for (const j in label.detections) {
        const detection = label.detections[j];
        const [key, fn] = PARSERS[label._cls];
        imgLabels[key][key].push(fn(i, detection));
      }
      continue;
    }
    const [key, fn] = PARSERS[label._cls];
    imgLabels[key][key].push(fn(i, label));
  }
  return imgLabels;
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
  const props = thumbnail
    ? { onClick: handleClick, onDoubleClick: handleDoubleClick }
    : {};
  useEffect(() => {
    if (thumbnail) {
      player.thumbnailMode();
    }
    player.render(id);
  }, []);
  return <div id={id} style={style} {...props} />;
};
