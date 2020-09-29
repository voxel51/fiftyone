import mime from "mime-types";
import React, { useState, useEffect } from "react";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";

import Player51 from "../player51/build/cjs/player51.min.js";
import { useEventHandler } from "../utils/hooks";
import { loadOverlay } from "../utils/labels";

import * as atoms from "../recoil/atoms";

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
