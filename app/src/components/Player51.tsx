import mime from "mime-types";
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import CircularProgress from "@material-ui/core/CircularProgress";
import { Warning } from "@material-ui/icons";

import ExternalLink from "./ExternalLink";
import Player51 from "player51";
import { useEventHandler } from "../utils/hooks";
import { convertSampleToETA } from "../utils/labels";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const InfoWrapper = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 100;
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
  p {
    margin: 0;
  }
`;

export default ({
  thumbnail,
  sample,
  src,
  style,
  onClick,
  onDoubleClick,
  overlay = null,
  onLoad = () => {},
  onMouseEnter = () => {},
  onMouseLeave = () => {},
  keep = false,
  activeLabels,
  activeFrameLabels,
  colorByLabel,
  fieldSchema = {},
  filterSelector,
  playerRef,
  selectedObjects,
  onSelectObject,
  savedOverlayOptions,
}) => {
  const isVideo = useRecoilValue(selectors.isVideoDataset);
  const filter = useRecoilValue(filterSelector);
  const fps = useRecoilValue(atoms.sampleFrameRate(sample._id));
  const overlayOptions = useRecoilValue(selectors.playerOverlayOptions);

  const colorMap = useRecoilValue(selectors.colorMap);
  if (overlay === null) {
    overlay = convertSampleToETA(sample, fieldSchema);
  }
  const [mediaLoading, setMediaLoading] = useState(true);
  const [initLoad, setInitLoad] = useState(false);
  const [error, setError] = useState(null);
  const [id] = useState(() => uuid());
  const mimetype =
    (sample.metadata && sample.metadata.mime_type) ||
    mime.lookup(sample.filepath) ||
    "image/jpg";
  const playerActiveLabels = {
    ...activeLabels,
    ...Object.keys(activeFrameLabels).reduce((acc, cur) => {
      return {
        ...acc,
        ["frames." + cur]: activeFrameLabels[cur],
      };
    }, {}),
  };

  const [player] = useState(() => {
    try {
      return new Player51({
        media: {
          src,
          type: mimetype,
        },
        overlay,
        colorMap,
        activeLabels: playerActiveLabels,
        filter,
        enableOverlayOptions: {
          attrRenderMode: false,
          attrsOnlyOnClick: false,
          attrRenderBox: false,
        },
        defaultOverlayOptions: {
          ...overlayOptions,
          ...savedOverlayOptions,
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
        colorByLabel,
        filter,
        colorMap,
        fps,
      });
      player.updateOverlayOptions(overlayOptions);
      if (!thumbnail) {
        player.updateOverlay(overlay);
      }
    }
  }, [
    player,
    filter,
    overlay,
    playerActiveLabels,
    colorMap,
    colorByLabel,
    fps,
    overlayOptions,
  ]);

  useEffect(() => {
    if (player && selectedObjects) {
      player.updateOptions({ selectedObjects });
    }
  }, [player, selectedObjects]);

  useEffect(() => {
    return () => player && !keep && player.destroy();
  }, [player]);

  useEventHandler(player, "load", () => setMediaLoading(false));
  useEventHandler(player, "load", onLoad);
  useEventHandler(player, "error", () =>
    setError(
      <>
        <p>
          This {isVideo ? "video" : "image"} failed to load. The file may not
          exist, or its type ({mimetype}) may be unsupported.
        </p>
        <p>
          {isVideo && (
            <>
              {" "}
              You can use{" "}
              <code>
                <ExternalLink href="https://voxel51.com/docs/fiftyone/api/fiftyone.utils.video.html#fiftyone.utils.video.reencode_videos">
                  fiftyone.utils.video.reencode_videos()
                </ExternalLink>
              </code>{" "}
              to re-encode videos in a supported format.
            </>
          )}
        </p>
      </>
    )
  );
  useEventHandler(player, "mouseenter", onMouseEnter);
  useEventHandler(player, "mouseleave", onMouseLeave);
  useEventHandler(player, "select", (e) => {
    const id = e.data?.id;
    const name = e.data?.name;
    if (id && onSelectObject) {
      onSelectObject({ id, name });
    }
  });

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
