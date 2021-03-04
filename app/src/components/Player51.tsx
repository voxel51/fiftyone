import mime from "mime-types";
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import uuid from "react-uuid";
import { useRecoilState, useRecoilValue } from "recoil";
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
  left: -1000;
  top: -1000;
  z-index: 20000;
  pointer-events: none;
`);

const computeCoordinates = (
  [x, y]: [number, number],
  ref: { current: HTMLElement | null }
): { bottom?: string | number; top?: string | number; left?: number } => {
  if (!ref.current) {
    return {};
  }
  x +=
    x < window.innerWidth / 2
      ? 24
      : -24 - ref.current.getBoundingClientRect().width;
  let top: string | number = y,
    bottom: string | number = "unset";
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

const ContentItem = ({
  name,
  value,
  style,
}: {
  name: string;
  value?: number | string;
  style?: object;
}) => {
  return (
    <ContentItemDiv>
      <ContentValue>
        {(() => {
          switch (typeof value) {
            case "number":
              return Number.isInteger(value) ? value : value.toFixed(3);
            case "string":
              return value;
            case "boolean":
              return value ? "True" : "False";
            default:
              return "None";
          }
        })()}
      </ContentValue>
      <ContentName style={style}>{name}</ContentName>
    </ContentItemDiv>
  );
};

const ConfidenceItem = ({ confidence }) => {
  return <ContentItem name={"confidence"} value={confidence} />;
};

const ClassificationInfo = ({ info }) => {
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <SelectedItem info={info} />
      <ContentItem key={"field"} name={"field"} value={info.field} />
      <ContentItem key={"label"} name={"label"} value={info.label} />
      <ConfidenceItem confidence={info.confidence} />
      <AttrInfo attrs={info.attrs} />
    </ContentBlock>
  );
};

const useTarget = (field, target) => {
  const getTarget = useRecoilValue(selectors.getTarget);
  return getTarget(field, target);
};

const MaskInfo = ({ info }) => {
  const targetValue = useTarget(info.field, info.target);
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <SelectedItem info={info} />
      <ContentItem key={"field"} name={"field"} value={info.field} />
      <ContentItem key={"target-value"} name={"label"} value={targetValue} />
    </ContentBlock>
  );
};

const AttrInfo = ({ attrs }) => {
  if (!attrs) {
    return null;
  }
  let etc = null;
  let entries = attrs;
  if (attrs.length > 4) {
    etc = `and ${entries.length - 4} more attribues`;
    entries = entries.slice(0, 4);
  }

  return (
    <>
      {entries.map((a) => (
        <ContentItem key={a.name} name={a.name} value={a.value} />
      ))}
      {etc && (
        <>
          <br />
          {etc}
        </>
      )}
    </>
  );
};

const SelectedItem = ({ info }) => {
  const selectedObjects = useRecoilValue(selectors.selectedObjectIds);
  if (selectedObjects.has(info.id)) {
    return (
      <ContentItem
        name={"selected"}
        value={"True"}
        style={{ color: info.color }}
      />
    );
  }
  return null;
};

const DetectionInfo = ({ info }) => {
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <SelectedItem info={info} />
      <ContentItem key={"field"} name={"field"} value={info.field} />
      <ContentItem key={"label"} name={"label"} value={info.label} />
      <ConfidenceItem confidence={info.confidence} />
      <AttrInfo attrs={info.attrs} />
    </ContentBlock>
  );
};

const KeypointInfo = ({ info }) => {
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <SelectedItem info={info} />
      <ContentItem key={"field"} name={"field"} value={info.field} />
      <ContentItem key={"label"} name={"label"} value={info.label} />
      <ContentItem
        key={"# keypoints"}
        name={"# keypoints"}
        value={info.numPoints}
      />
      <ConfidenceItem confidence={info.confidence} />
      <AttrInfo attrs={info.attrs} />
    </ContentBlock>
  );
};

const PolylineInfo = ({ info }) => {
  return (
    <ContentBlock style={{ borderColor: info.color }}>
      <SelectedItem info={info} />
      <ContentItem key={"field"} name={"field"} value={info.field} />
      <ContentItem key={"label"} name={"label"} value={info.label} />
      <ConfidenceItem confidence={info.confidence} />
      <ContentItem key={"closed"} name={"closed"} value={info.closed} />
      <ContentItem key={"filled"} name={"filled"} value={info.filled} />
      <ContentItem key={"# points"} name={"# points"} value={info.points} />
      <AttrInfo attrs={info.attrs} />
    </ContentBlock>
  );
};

const OVERLAY_INFO = {
  classification: ClassificationInfo,
  detection: DetectionInfo,
  keypoints: KeypointInfo,
  mask: MaskInfo,
  polyline: PolylineInfo,
};

const TooltipInfo = ({ player, moveRef }) => {
  const [display, setDisplay] = useState(false);
  const [coords, setCoords] = useState({
    top: -1000,
    left: -1000,
    bottom: "unset",
  });
  const position = display
    ? coords
    : { top: -1000, left: -1000, bottom: "unset" };
  const coordsProps = useSpring({
    ...position,
    config: {
      duration: 0,
    },
  });
  const [overlays, setOverlays] = useState([]);
  const [point, setPoint] = useState([0, 0]);
  const ref = useRef<HTMLDivElement>(null);

  useEventHandler(player, "tooltipinfo", (e) => {
    setOverlays(e.data.overlays);
    setPoint(e.data.point);
  });
  useEventHandler(player, "mouseenter", () => setDisplay(true));
  useEventHandler(player, "mouseleave", () => setDisplay(false));

  useEffect(() => {
    moveRef.current = ({ values }) => {
      setCoords(computeCoordinates(values, ref));
    };
  });

  let more;
  let limitedOverlays = overlays ? overlays : [];
  if (limitedOverlays.length > 3) {
    more = limitedOverlays.length - 3;
    limitedOverlays = limitedOverlays.slice(0, 3);
  }

  const showProps = useSpring({
    display: display ? "block" : "none",
    opacity: display && limitedOverlays.length ? 1 : 0,
  });

  return limitedOverlays.length
    ? ReactDOM.createPortal(
        <TooltipDiv
          style={{ ...coordsProps, ...showProps, position: "fixed" }}
          ref={ref}
        >
          <ContentHeader key="header">
            {point[0]}, {point[1]}
          </ContentHeader>
          {limitedOverlays.map((o, i) => {
            const Component = OVERLAY_INFO[o.type];
            return <Component info={o} key={i} />;
          })}
        </TooltipDiv>,
        document.body
      )
    : null;
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
  activeLabelsAtom,
  colorByLabel,
  fieldSchema = {},
  filterSelector,
  playerRef,
  selectedObjects,
  onSelectObject,
}) => {
  const isVideo = useRecoilValue(selectors.isVideoDataset);
  const filter = useRecoilValue(filterSelector);
  const fps = useRecoilValue(atoms.sampleFrameRate(sample._id));
  const overlayOptions = useRecoilValue(selectors.playerOverlayOptions);
  const defaultTargets = useRecoilValue(selectors.defaultTargets);
  const [savedOverlayOptions, setSavedOverlayOptions] = useRecoilState(
    atoms.savedPlayerOverlayOptions
  );
  const colorMap = useRecoilValue(selectors.colorMap(!thumbnail));
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
  const activeLabelPaths = useRecoilValue(activeLabelsAtom);

  const [player] = useState(() => {
    try {
      return new Player51({
        media: {
          src,
          type: mimetype,
        },
        overlay,
        colorMap,
        activeLabels: activeLabelPaths,
        filter,
        enableOverlayOptions: {
          attrRenderMode: false,
          attrsOnlyOnClick: false,
          attrRenderBox: false,
        },
        defaultOverlayOptions: {
          ...overlayOptions,
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
        activeLabels: activeLabelPaths,
        colorByLabel,
        filter,
        colorMap,
        fps,
      });
      player.updateOverlayOptions(overlayOptions);
      if (!thumbnail) {
        player.updateOptions({ selectedObjects });
        player.updateOverlay(overlay);
      }
    }
  }, [
    player,
    filter,
    overlay,
    activeLabelPaths,
    colorMap,
    colorByLabel,
    fps,
    overlayOptions,
    defaultTargets,
    selectedObjects,
  ]);

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
  const ref = useRef(null);
  const containerRef = useRef(null);
  const bind = useMove((s) => ref.current && ref.current(s));

  useEventHandler(
    player,
    "options",
    ({ data: { showAttrs, showConfidence, showTooltip } }) => {
      setSavedOverlayOptions({
        showAttrs,
        showConfidence,
        showTooltip,
      });
    }
  );

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
