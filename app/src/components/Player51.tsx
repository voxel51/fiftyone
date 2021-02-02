import mime from "mime-types";
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import CircularProgress from "@material-ui/core/CircularProgress";
import { Warning } from "@material-ui/icons";
import { animated, useSpring } from "react-spring";

import { ContentDiv, ContentHeader, ContentBlock } from "./utils";
import ExternalLink from "./ExternalLink";
import Player51 from "player51";
import { useEventHandler } from "../utils/hooks";
import { convertSampleToETA } from "../utils/labels";
import { useMove } from "react-use-gesture";

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

const TooltipDiv = animated(styled(ContentDiv)`
  position: absolute;
  margin-top: 0;
  z-index: 20000;
  pointer-events: none;
`);

const computeCoordinates = ([x, y], ref) => {
  if (!ref.current) {
    return {};
  }
  x +=
    x < window.innerWidth / 2
      ? 24
      : -24 - ref.current.getBoundingClientRect().width;
  let top = y,
    bottom = "unset";
  if (y > window.innerHeight / 2) {
    bottom = window.innerHeight - y;
    top = "unset";
  }
  return {
    bottom,
    top,
    left: x,
  };
};

const ContentItemDiv = styled.div`
  margin: 0;
  padding: 0;
  max-width: 12rem;
  word-wrap: break-word;
`;

const ContentValue = styled.div`
  font-size: 0.8rem;
  font-weight: bold;
  color: ${({ theme }) => theme.font};
`;

const ContentName = styled.div`
  font-size: 0.7rem;
  font-weight: bold;
  padding-bottom: 0.3rem;
  color: ${({ theme }) => theme.fontDark};
`;

const ContentItem = ({ name, value }) => {
  return (
    <ContentItemDiv>
      <ContentValue>{value}</ContentValue>
      <ContentName>{name}</ContentName>
    </ContentItemDiv>
  );
};

const useTarget = (info) => {
  const getTarget = useRecoilValue(selectors.getTarget);
  return getTarget(info.field, info.target);
};

const ClassificationInfo = ({ info }) => {
  const targetValue = useTarget(info);
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <ContentItem key={"field"} name={"Field"} value={info.field} />
      <ContentItem key={"label"} name={"Label"} value={info.label} />
      {info.target && (
        <>
          <ContentItem key={"target"} name={"Target"} value={info.target} />
          <ContentItem
            key={"target-value"}
            name={"Target Value"}
            value={targetValue}
          />
        </>
      )}
      <ContentItem
        key={"confidence"}
        name={"Confidence"}
        value={
          typeof info.confidence === "number"
            ? info.confidence.toFixed(5)
            : "None"
        }
      />
    </ContentBlock>
  );
};

const MaskInfo = ({ info }) => {
  const coord = info.coordinates;
  const targetValue = useTarget(info);
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <ContentItem key={"field"} name={"Field"} value={info.field} />
      {info.target && (
        <>
          <ContentItem key={"target"} name={"Target"} value={info.target} />
          <ContentItem
            key={"target-value"}
            name={"Target Value"}
            value={targetValue}
          />
        </>
      )}
      <ContentItem
        key={"coordinates"}
        name={"Coordinates"}
        value={`${coord[0]}, ${coord[1]}`}
      />
      <ContentItem
        key={"dimensions"}
        name={"Dimensions"}
        value={`${info.shape[1]}, ${info.shape[0]}`}
      />
    </ContentBlock>
  );
};

const DetectionInfo = ({ info }) => {
  const targetValue = useTarget(info);
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <ContentItem key={"id"} name={"ID"} value={info.id} />
      <ContentItem key={"field"} name={"Field"} value={info.field} />
      <ContentItem key={"label"} name={"Label"} value={info.label} />
      <ContentItem
        key={"confidence"}
        name={"Confidence"}
        value={
          typeof info.confidence === "number"
            ? info.confidence.toFixed(5)
            : "None"
        }
      />
      {info.target && (
        <>
          <ContentItem key={"target"} name={"Target"} value={info.target} />
          <ContentItem
            key={"target-value"}
            name={"Target Value"}
            value={targetValue}
          />
        </>
      )}
      <ContentItem
        key={"top-left"}
        name={"Top-Left"}
        value={`${info.left.toFixed(5)}, ${info.top.toFixed(5)}`}
      />
      <ContentItem
        key={"dimensions"}
        name={"Dimensions"}
        value={`${info.width.toFixed(5)} x ${info.height.toFixed(5)}`}
      />
    </ContentBlock>
  );
};

const OVERLAY_INFO = {
  mask: MaskInfo,
  detection: DetectionInfo,
  classification: ClassificationInfo,
};

const TooltipInfo = ({ player, moveRef }) => {
  const [props, set] = useSpring(() => ({
    display: "none",
    opacity: 1,
    top: 0,
    left: 0,
  }));
  const [overlays, setOverlays] = useState([]);
  const [point, setPoint] = useState([0, 0]);
  const ref = useRef(null);

  useEventHandler(player, "tooltipinfo", (e) => {
    setOverlays(e.data.overlays);
    setPoint(e.data.point);
  });
  useEventHandler(player, "mouseenter", () => {
    set({ display: "block", opacity: 1 });
  });
  useEventHandler(player, "mouseleave", () =>
    set({ display: "none", opacity: 0 })
  );

  useEffect(() => {
    moveRef.current = ({ values }) => {
      set(computeCoordinates(values, ref));
    };
  });

  return ReactDOM.createPortal(
    <>
      {overlays.length && (
        <TooltipDiv style={props} ref={ref}>
          <ContentHeader>
            {point[0]}, {point[1]}
          </ContentHeader>
          {overlays.map((o) => {
            const Component = OVERLAY_INFO[o.type];
            return <Component info={o} />;
          })}
        </TooltipDiv>
      )}
    </>,
    document.body
  );
};

export default ({
  thumbnail,
  sample,
  src,
  style,
  onClick,
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
  const filter = useRecoilValue(filterSelector);
  const fps = useRecoilValue(atoms.sampleFrameRate(sample._id));
  const overlayOptions = useRecoilValue(selectors.playerOverlayOptions);
  const defaultTargets = useRecoilValue(selectors.defaultTargets);
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
  const props = thumbnail ? { onClick } : {};
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
    defaultTargets,
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
          This video failed to load. Its type ({mimetype}) may be unsupported.
        </p>
        <p>
          You can use{" "}
          <code>
            <ExternalLink href="https://voxel51.com/docs/fiftyone/api/fiftyone.utils.video.html#fiftyone.utils.video.reencode_videos">
              fiftyone.utils.video.reencode_videos()
            </ExternalLink>
          </code>{" "}
          to re-encode videos in a supported format.
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
  const ref = useRef(null);
  const containerRef = useRef(null);
  const bind = useMove((s) => ref.current && ref.current(s));

  return (
    <animated.div
      id={id}
      style={style}
      {...props}
      {...bind()}
      ref={containerRef}
    >
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
      <TooltipInfo player={player} moveRef={ref} containerRef={containerRef} />
    </animated.div>
  );
};
