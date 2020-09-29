import mime from "mime-types";
import React, { useState, useEffect } from "react";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";

import Player51 from "../player51/build/cjs/player51.min.js";
import { useEventHandler } from "../utils/hooks";
import {
  RESERVED_FIELDS,
  VALID_SCALAR_TYPES,
  getDetectionAttributes,
  convertAttributesToETA,
  stringify,
} from "../utils/labels";

import * as atoms from "../recoil/atoms";

const PARSERS = {
  Classification: [
    "attrs",
    (name, obj) => {
      return {
        type: "eta.core.data.CategoricalAttribute",
        name,
        confidence: obj.confidence,
        value: obj.label,
      };
    },
  ],
  Detection: [
    "objects",
    (name, obj) => {
      const bb = obj.bounding_box;
      const attrs = convertAttributesToETA(getDetectionAttributes(obj));
      return {
        type: "eta.core.objects.DetectedObject",
        name,
        label: `${obj.label}`,
        confidence: obj.confidence,
        bounding_box: bb
          ? {
              top_left: { x: bb[0], y: bb[1] },
              bottom_right: { x: bb[0] + bb[2], y: bb[1] + bb[3] },
            }
          : {
              top_left: { x: 0, y: 0 },
              bottom_right: { x: 0, y: 0 },
            },
        attrs: { attrs },
      };
    },
  ],
};

const loadOverlay = (sample, fieldSchema) => {
  const imgLabels = { attrs: { attrs: [] }, objects: { objects: [] } };
  const sampleFields = Object.keys(sample).sort();
  for (const sampleField of sampleFields) {
    if (RESERVED_FIELDS.includes(sampleField)) {
      continue;
    }
    const field = sample[sampleField];
    if (field === null || field === undefined) continue;
    if (["Classification", "Detection"].includes(field._cls)) {
      const [key, fn] = PARSERS[field._cls];
      imgLabels[key][key].push(fn(sampleField, field));
    } else if (["Classifications", "Detections"].includes(field._cls)) {
      for (const object of field[field._cls.toLowerCase()]) {
        const [key, fn] = PARSERS[object._cls];
        imgLabels[key][key].push(fn(sampleField, object));
      }
      continue;
    } else if (VALID_SCALAR_TYPES.includes(fieldSchema[sampleField])) {
      imgLabels.attrs.attrs.push({
        name: sampleField,
        value: stringify(field),
      });
    }
  }
  return imgLabels;
};

export default ({
  thumbnail,
  sample,
  src,
  style,
  onClick,
  onDoubleClick,
  onLoad = () => {},
  activeLabels,
  fieldSchema = {},
  filterSelector,
  playerRef,
  defaultOverlayOptions,
}) => {
  const filter = useRecoilValue(filterSelector);
  const colorMap = useRecoilValue(atoms.colorMap);
  const overlay = loadOverlay(sample, fieldSchema);
  const [initLoad, setInitLoad] = useState(false);
  const id = uuid();
  const mimetype =
    (sample.metadata && sample.metadata.mime_type) ||
    mime.lookup(sample.filepath) ||
    "image/jpg";
  const [player] = useState(
    new Player51({
      media: {
        src,
        type: mimetype,
      },
      overlay,
      colorMap,
      activeLabels,
      filter,
      enableOverlayOptions: {
        attrRenderMode: false,
        attrsOnlyOnClick: false,
        attrRenderBox: false,
      },
      defaultOverlayOptions: {
        ...defaultOverlayOptions,
        action: "hover",
        attrRenderMode: "attr-value",
      },
    })
  );
  if (playerRef) {
    playerRef.current = player;
  }
  const props = thumbnail ? { onClick, onDoubleClick } : {};
  useEffect(() => {
    if (!initLoad) {
      if (thumbnail) {
        player.thumbnailMode();
      }
      player.render(id);
      setInitLoad(true);
    } else {
      player.updateOptions({
        activeLabels,
        filter,
        colorMap,
      });
    }
  }, [filter, overlay, activeLabels, colorMap]);

  useEventHandler(player, "load", onLoad);

  return <div id={id} style={style} {...props} />;
};
