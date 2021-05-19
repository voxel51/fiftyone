import React, { useState, useEffect, useRef, MutableRefObject } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import {
  SerializableParam,
  selectorFamily,
  useRecoilValue,
  useRecoilCallback,
} from "recoil";
import { Warning } from "@material-ui/icons";
import { animated, useSpring } from "react-spring";

import { ContentDiv, ContentHeader } from "./utils";
import ExternalLink from "./ExternalLink";
import { FrameLooker, ImageLooker, VideoLooker } from "looker";
import { useEventHandler } from "../utils/hooks";
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

const TagBlock = styled.div`
  margin: 0;
`;

const BorderDiv = styled.div`
  border-top: 2px solid ${({ theme }) => theme.font};
  width: 100%;
  padding: 0.5rem 0 0;
`;

const AttrBlock = styled.div`
  padding: 0.1rem 0 0 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-row-gap: 0.1rem;
  grid-column-gap: 0.5rem;
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
  max-width: 10rem;
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
    <ContentItemDiv style={style}>
      <ContentValue>
        {(() => {
          switch (typeof value) {
            case "number":
              return Number.isInteger(value) ? value : value.toFixed(3);
            case "string":
              return value;
            case "boolean":
              return value ? "True" : "False";
            case "object":
              return Array.isArray(value) ? "[...]" : "{...}";
            default:
              return "None";
          }
        })()}
      </ContentValue>
      <ContentName>{name}</ContentName>
    </ContentItemDiv>
  );
};

const useTarget = (field, target) => {
  const getTarget = useRecoilValue(selectors.getTarget);
  return getTarget(field, target);
};

const AttrInfo = ({ field, id, frameNumber, children = null }) => {
  const attrs = useRecoilValue(
    selectors.modalLabelAttrs({ field, id, frameNumber })
  );
  let entries = attrs.filter(([k, v]) => k !== "tags");
  if (!entries || !entries.length) {
    return null;
  }

  const defaults: [string, string | number | null] = entries.filter(([name]) =>
    ["label", "confidence"].includes(name)
  );

  const other = entries.filter(
    ([name]) => !["label", "confidence"].includes(name)
  );
  const mapper = ([name, value]: [string, string | number | null]) => (
    <ContentItem key={name} name={name} value={value} />
  );

  return (
    <>
      {defaults.map(mapper)}
      {children}
      {other.map(mapper)}
    </>
  );
};

const ClassificationInfo = ({ info }) => {
  return (
    <AttrBlock style={{ borderColor: info.color }}>
      <AttrInfo
        field={info.field}
        id={info.id}
        frameNumber={info.frameNumber}
      />
    </AttrBlock>
  );
};

const DetectionInfo = ({ info }) => {
  return (
    <AttrBlock style={{ borderColor: info.color }}>
      <AttrInfo
        field={info.field}
        id={info.id}
        frameNumber={info.frameNumber}
      />
    </AttrBlock>
  );
};

const KeypointInfo = ({ info }) => {
  return (
    <AttrBlock style={{ borderColor: info.color }}>
      <AttrInfo field={info.field} id={info.id} frameNumber={info.frameNumber}>
        <ContentItem
          key={"# keypoints"}
          name={"# keypoints"}
          value={info.numPoints}
        />
      </AttrInfo>
    </AttrBlock>
  );
};

const SegmentationInfo = ({ info }) => {
  const targetValue = useTarget(info.field, info.target);

  return (
    <AttrBlock style={{ borderColor: info.color }}>
      <ContentItem key={"target-value"} name={"label"} value={targetValue} />
      <AttrInfo
        field={info.field}
        id={info.id}
        frameNumber={info.frameNumber}
      />
    </AttrBlock>
  );
};

const PolylineInfo = ({ info }) => {
  return (
    <AttrBlock style={{ borderColor: info.color }}>
      <AttrInfo field={info.field} id={info.id} frameNumber={info.frameNumber}>
        <ContentItem key={"# points"} name={"# points"} value={info.points} />
      </AttrInfo>
    </AttrBlock>
  );
};

const Border = ({ color, id }) => {
  const selectedLabels = useRecoilValue(selectors.selectedLabelIds);
  return (
    <BorderDiv
      style={{
        borderTop: `2px ${
          selectedLabels.has(id) ? "dashed" : "solid"
        } ${color}`,
      }}
    />
  );
};

const OVERLAY_INFO = {
  Classification: ClassificationInfo,
  Detection: DetectionInfo,
  Keypoint: KeypointInfo,
  Segmentation: SegmentationInfo,
  Polyline: PolylineInfo,
};

const TagInfo = ({ field, id, frameNumber }) => {
  const tags = useRecoilValue(
    selectors.modalLabelTags({ field, id, frameNumber })
  );
  if (!tags.length) return null;
  return (
    <TagBlock>
      <ContentItem
        key={"tags"}
        name={"tags"}
        value={tags.length ? tags.join(", ") : "No tags"}
        style={{ maxWidth: "20rem" }}
      />
    </TagBlock>
  );
};

const TooltipInfo = ({ lookerRef, moveRef }) => {
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
  const [overlay, setOverlay] = useState(null);
  const ref = useRef<HTMLDivElement>(null);

  useEventHandler(lookerRef.current, "tooltipinfo", (e) => {
    setOverlay(e.detail ? e.data.overlays[0] : null);
  });
  useEventHandler(lookerRef.current, "mouseenter", () => setDisplay(true));
  useEventHandler(lookerRef.current, "mouseleave", () => setDisplay(false));

  const showProps = useSpring({
    display: display ? "block" : "none",
    opacity: display && overlay ? 1 : 0,
  });
  const Component = overlay ? OVERLAY_INFO[overlay.type] : null;

  return Component
    ? ReactDOM.createPortal(
        <TooltipDiv
          style={{ ...coordsProps, ...showProps, position: "fixed" }}
          ref={ref}
        >
          <ContentHeader key="header">{overlay.field}</ContentHeader>
          <Border color={overlay.color} id={overlay.id} />
          <TagInfo
            key={"tags"}
            field={overlay.field}
            id={overlay.id}
            frameNumber={overlay.frameNumber}
          />
          <Component key={"attrs"} info={overlay} />
        </TooltipDiv>,
        document.body
      )
    : null;
};

const usePlayer51Error = (playerRef, sampleId, setError) => {
  const handler = useRecoilCallback(
    ({ snapshot }) => async () => {
      const isVideo = await snapshot.getPromise(selectors.isVideoDataset);
      const mimeType = await snapshot.getPromise(
        selectors.sampleMimeType(sampleId)
      );
      setError(
        <>
          <p>
            This {isVideo ? "video" : "image"} failed to load. The file may not
            exist, or its type ({mimeType}) may be unsupported.
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
      );
    },
    [sampleId]
  );
  useEventHandler(playerRef.current, "error", handler);
};

const usePlayer51OptionsUpdate = (playerRef) => {
  const handler = useRecoilCallback(
    ({ set }) => async ({
      data: { showAttrs, showConfidence, showTooltip },
    }) => {
      set(atoms.savedPlayerOverlayOptions, {
        showAttrs,
        showConfidence,
        showTooltip,
      });
    },
    []
  );

  useEventHandler(playerRef.current, "options", handler);
};

type EventCallback = (event: Event) => void;

interface Player51Options {
  activeFields: string[];
  sample: { [key: string]: SerializableParam };
  thumbnail: boolean;
}

const player51Options = selectorFamily<
  Player51Options,
  { sampleId: string; thumbnail: boolean }
>({
  key: "playerOptions",
  get: ({ sampleId, thumbnail }) => ({ get }) => {
    const modal = !thumbnail;
    return {
      colorMap: get(selectors.colorMap(modal)),
      enableOverlayOPtions: {
        attrRenderMode: false,
        attrsOnlyOnClick: false,
        attrRenderBox: false,
      },
      defaultOverlayOptions: {
        action: "hover",
        attrRenderMode: "attr-value",
        smoothMasks: false,
      },
      sample: get(modal ? atoms.sampleModal(sampleId) : atoms.sample(sampleId)),
      src: get(selectors.sampleSrc(sampleId)),
      thumbnail,
    };
  },
});

interface LookerProps {
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onSelect?: EventCallback;
  sampleId: string;
  style: React.CSSProperties;
  thumbnail: boolean;
}

const Looker = ({
  onClick,
  onSelect,
  sampleId,
  style,
  thumbnail,
}: LookerProps) => {
  return (
    <div
      ref={(node) => {
        if (node) {
          new ImageLooker({});
        }
      }}
      style={style}
      onClick={onClick}
    ></div>
  );
};

export default React.memo(Looker);
