import mime from "mime-types";
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import CircularProgress from "@material-ui/core/CircularProgress";
import { Warning } from "@material-ui/icons";

import Player51 from "../player51/build/cjs/player51.min.js";
import { useEventHandler } from "../utils/hooks";
import { convertSampleToETA } from "../utils/labels";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const InfoWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 125%;
  svg {
    font-size: 200%;
    color: ${({ theme }) => theme.fontDark};
  }
  svg.error {
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
  const [mediaLoading, setMediaLoading] = useState(true);
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
          smoothMasks: false,
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

  useEventHandler(player, "load", () => setMediaLoading(false));
  useEventHandler(player, "load", onLoad);
  useEventHandler(player, "error", () =>
    setError(
      `This video failed to load. Its type (${mimetype}) may be unsupported.`
    )
  );

  return (
    <div id={id} style={style} {...props}>
      {error || mediaLoading ? (
        <InfoWrapper>
          {error ? (
            <>
              <Warning classes={{ root: "error" }} />
              {thumbnail ? null : <div>{error}</div>}{" "}
            </>
          ) : mediaLoading && !thumbnail ? (
            <CircularProgress />
          ) : null}
        </InfoWrapper>
      ) : null}
    </div>
  );
};
