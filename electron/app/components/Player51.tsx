import _ from "lodash";
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

const loadOverlay = (sample) => {
  const imgLabels = { attrs: { attrs: [] }, objects: { objects: [] } };
  for (const i in sample) {
    if (_.indexOf(["metadata", "_id", "tags", "filepath"], i) >= 0) continue;
    const field = sample[i];
    console.log(field);
    if (field.detections) {
      for (const j in field.detections) {
        const detection = field.detections[j];
        const [key, fn] = PARSERS.ODMDetectionLabels;
        imgLabels[key][key].push(fn(i, detection));
      }
      continue;
    }
  }
  return imgLabels;
};

export default ({ thumbnail, sample, src, style, onClick, onDoubleClick }) => {
  const overlay = loadOverlay(sample);
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
