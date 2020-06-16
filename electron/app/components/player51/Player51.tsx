import _ from "lodash";
import React, { useState, useEffect } from "react";
import uuid from "react-uuid";

import Player51 from "../player51/build/cjs/player51.min.js";
import clickHandler from "../utils/click.ts";

const PARSERS = {
  Classification: [
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
  Detection: [
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

const loadOverlay = (sample, colors) => {
  const imgLabels = { attrs: { attrs: [] }, objects: { objects: [] } };
  const colorMap = {};
  const sampleKeys = Object.keys(sample).sort();
  for (const i in sampleKeys) {
    const e = sampleKeys[i];
    if (_.indexOf(["metadata", "_id", "tags", "filepath"], e) >= 0) {
      continue;
    }
    const field = sample[e];
    if (!field) continue;
    if (field._cls === "Detections") {
      for (const j in field.detections) {
        const detection = field.detections[j];
        const [key, fn] = PARSERS[detection._cls];
        imgLabels[key][key].push(fn(e, detection));
        colorMap[`${e}:${detection.label}`] = colors[i];
      }
      continue;
    }
    if (field._cls === "Classification") {
      const [key, fn] = PARSERS[field._cls];
      imgLabels[key][key].push(fn(e, field));
    }
  }
  return [imgLabels, colorMap];
};

export default ({
  colors,
  thumbnail,
  sample,
  src,
  style,
  onClick,
  onDoubleClick,
  activeLabels,
}) => {
  const [overlay, colorMap] = loadOverlay(sample, colors);
  const [handleClick, handleDoubleClick] = clickHandler(onClick, onDoubleClick);
  const [initLoad, setInitLoad] = useState(false);
  const id = uuid();
  const [player, setPlayer] = useState(
    new Player51({
      media: {
        src: src,
        type: "image/jpg",
      },
      overlay: overlay,
      colorMap: colorMap,
    })
  );
  const props = thumbnail
    ? { onClick: handleClick, onDoubleClick: handleDoubleClick }
    : {};
  useEffect(() => {
    if (!initLoad) {
      if (thumbnail) {
        player.thumbnailMode();
      }
      player.render(id, activeLabels);
      setInitLoad(true);
    } else {
      player.renderer.processFrame(activeLabels);
    }
  }, [activeLabels]);
  return <div id={id} style={style} {...props} />;
};
