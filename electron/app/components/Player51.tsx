import mime from "mime-types";
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import { Warning } from "@material-ui/icons";

import Player51 from "../player51/build/cjs/player51.min.js";
import { useEventHandler } from "../utils/hooks";
import { convertSampleToETA } from "../utils/labels";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const ErrorWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  font-size: 150%;
  svg {
    font-size: 200%;
    color: ${({ theme }) => theme.error};
  }
`;

export default ({
  thumbnail,
  sample,
  metadata = {},
  src,
  style,
  onClick,
  onDoubleClick,
  onLoad = () => {},
  activeLabels,
  frameLabelsActive,
  fieldSchema = {},
  filterSelector,
  playerRef,
  defaultOverlayOptions,
}) => {
  const filter = useRecoilValue(filterSelector);
  const colorMap = useRecoilValue(atoms.colorMap);
  const mediaType = useRecoilValue(selectors.mediaType);
  const overlay = convertSampleToETA(sample, fieldSchema);
  const [initLoad, setInitLoad] = useState(false);
  const [error, setError] = useState(null);
  const id = uuid();
  const mimetype =
    (sample.metadata && sample.metadata.mime_type) ||
    mime.lookup(sample.filepath) ||
    "image/jpg";
  const playerActiveLabels = {
    ...activeLabels,
  };
  if (mediaType === "video") {
    playerActiveLabels.frames = frameLabelsActive;
  }
  const [player] = useState(() => {
    try {
      return new Player51({
        media: {
          src,
          type: mimetype,
        },
        overlay,
        fps: metadata.fps,
        colorMap,
        playerActiveLabels,
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
      });
    } catch (e) {
      setError(`This file type (${mimetype}) is not supported.`);
    }
  });

  if (playerRef) {
    playerRef.current = player;
  }
  const props = thumbnail ? { onClick, onDoubleClick } : {};
  useEffect(() => {
    if (!player || error) {
      return;
    }
    if (!initLoad) {
      if (thumbnail) {
        player.thumbnailMode();
      }
      player.render(id);
      setInitLoad(true);
    } else {
      player.updateOptions({
        activeLabels: playerActiveLabels,
        filter,
        colorMap,
      });
    }
  }, [player, filter, overlay, playerActiveLabels, colorMap]);

  useEventHandler(player, "load", onLoad);

  return (
    <div id={id} style={style} {...props}>
      {error ? (
        <ErrorWrapper>
          <Warning />
          {thumbnail ? null : <div>{error}</div>}
        </ErrorWrapper>
      ) : null}
    </div>
  );
};
