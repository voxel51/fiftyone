import React, { useState, useRef, MutableRefObject, useEffect } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import { selectorFamily, useRecoilValue, useRecoilCallback } from "recoil";
import { animated, useSpring } from "react-spring";
import { v4 as uuid } from "uuid";

import * as labelAtoms from "./Filters/utils";
import ExternalLink from "./ExternalLink";
import { ContentDiv, ContentHeader } from "./utils";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { useEventHandler } from "../utils/hooks";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import {
  FrameOptions,
  ImageOptions,
  VideoOptions,
} from "@fiftyone/looker/src/state";
import { useMove } from "react-use-gesture";
import { request } from "../utils/socket";

type LookerTypes = typeof FrameLooker | typeof ImageLooker | typeof VideoLooker;

const lookerType = selectorFamily<LookerTypes, string>({
  key: "lookerType",
  get: (sampleId) => ({ get }) => {
    const video = get(selectors.sampleMimeType(sampleId)).startsWith("video/");
    const isFrame = get(selectors.isFramesView);
    const isPatch = get(selectors.isPatchesView);
    if (video && (isFrame || isPatch)) {
      return FrameLooker;
    }

    if (video) {
      return VideoLooker;
    }
    return ImageLooker;
  },
});

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

type placement = number | "unset";

const computeCoordinates = ([x, y]: [number, number]): {
  bottom?: placement;
  top?: placement;
  left?: placement;
  right?: placement;
} => {
  let top: placement = y,
    bottom: placement = "unset";
  if (y > window.innerHeight / 2) {
    bottom = window.innerHeight - y;
    top = "unset";
  }

  return {
    bottom,
    top,
    left: x <= window.innerWidth / 2 ? x + 24 : "unset",
    right: x > window.innerWidth / 2 ? window.innerWidth - x + 24 : "unset",
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
        id={info.label._id}
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
        id={info.label._id}
        frameNumber={info.frameNumber}
      />
    </AttrBlock>
  );
};

const KeypointInfo = ({ info }) => {
  return (
    <AttrBlock style={{ borderColor: info.color }}>
      <AttrInfo
        field={info.field}
        id={info.label._id}
        frameNumber={info.frameNumber}
      >
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
        id={info.label._id}
        frameNumber={info.frameNumber}
      />
    </AttrBlock>
  );
};

const PolylineInfo = ({ info }) => {
  return (
    <AttrBlock style={{ borderColor: info.color }}>
      <AttrInfo
        field={info.field}
        id={info.label._id}
        frameNumber={info.frameNumber}
      >
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

const TooltipInfo = React.memo(
  ({ looker }: { looker: any; moveRef: MutableRefObject<HTMLDivElement> }) => {
    const [detail, setDetail] = useState(null);
    const [coords, setCoords] = useState<{
      top?: placement;
      bottom?: placement;
      left?: placement;
    }>({
      top: -1000,
      left: -1000,
      bottom: "unset",
    });
    const position = detail
      ? coords
      : { top: -1000, left: -1000, bottom: "unset" };

    const coordsProps = useSpring({
      ...position,
      config: {
        duration: 0,
      },
    });
    const ref = useRef<HTMLDivElement>(null);

    useEventHandler(looker, "tooltip", (e) => {
      setDetail(e.detail ? e.detail : null);
      e.detail && setCoords(computeCoordinates(e.detail.coordinates));
    });

    const showProps = useSpring({
      display: detail ? "block" : "none",
      opacity: detail ? 1 : 0,
    });
    const Component = detail ? OVERLAY_INFO[detail.type] : null;

    return Component
      ? ReactDOM.createPortal(
          <TooltipDiv
            style={{ ...coordsProps, ...showProps, position: "fixed" }}
            ref={ref}
          >
            <ContentHeader key="header">{detail.field}</ContentHeader>
            <Border color={detail.color} id={detail.label._id} />
            <TagInfo
              key={"tags"}
              field={detail.field}
              id={detail.label._id}
              frameNumber={detail.frameNumber}
            />
            <Component key={"attrs"} info={detail} />
          </TooltipDiv>,
          document.body
        )
      : null;
  }
);

const useLookerError = (looker, sampleId, setError) => {
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
  useEventHandler(looker, "error", handler);
};

type EventCallback = (event: CustomEvent) => void;

export const defaultLookerOptions = selectorFamily({
  key: "defaultLookerOptions",
  get: (modal: boolean) => ({ get }) => {
    const showLabel = get(selectors.appConfig).show_label;
    const showConfidence = get(selectors.appConfig).show_confidence;
    const showTooltip = get(selectors.appConfig).show_tooltip;
    const video = get(selectors.isVideoDataset) && !modal ? { loop: true } : {};
    const imageOrFrame = get(selectors.isPatchesView) ? { zoom: true } : {};
    const colorByLabel = get(atoms.colorByLabel(modal));
    return {
      colorByLabel,
      showLabel,
      showConfidence,
      showTooltip,
      ...video,
      ...imageOrFrame,
    };
  },
});

export const lookerOptions = selectorFamily<
  Partial<FrameOptions | ImageOptions | VideoOptions>,
  { modal: boolean; sampleId: string }
>({
  key: "lookerOptions",
  get: ({ modal, sampleId }) => ({ get, getCallback }) => {
    const options = {
      ...get(defaultLookerOptions(modal)),
      activeLabels: get(labelAtoms.activeFields(modal)),
      colorMap: get(selectors.colorMap(modal)),
      filter: get(labelFilters(modal)),
    };
    const isVideo = get(selectors.isVideoDataset) && get(selectors.isRootView);
    if (modal) {
      return {
        ...options,
        ...get(atoms.savedLookerOptions),
        selectedLabels: [...get(selectors.selectedLabelIds)],
      };
    }
    if (isVideo) {
      const frames = get(atoms.sampleFrames(sampleId));
      let cancelled = false;
      return {
        ...options,
        requestFrames: {
          request: getCallback(({ set }) => async () => {
            const { sample } = await request({
              type: "sample",
              args: { sample_id: sampleId },
              uuid: uuid(),
            });

            !cancelled && set(atoms.sampleFrames(sampleId), sample.frames);
          }),
        },
        cancel: () => (cancelled = true),
      };
    }
    return options;
  },
});

export const useLookerOptionsUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async (event: CustomEvent) => {
      const currentOptions = await snapshot.getPromise(
        atoms.savedLookerOptions
      );
      set(atoms.savedLookerOptions, { ...currentOptions, ...event.detail });
    }
  );
};

interface LookerProps {
  lookerRef: MutableRefObject<any>;
  modal: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onNext?: EventCallback;
  onPrevious?: EventCallback;
  onSelectLabel?: EventCallback;
  sampleId: string;
  style?: React.CSSProperties;
}

const Looker = ({
  lookerRef,
  modal,
  onClick,
  onNext,
  onPrevious,
  onSelectLabel,
  sampleId,
  style,
}: LookerProps) => {
  let sample = useRecoilValue(atoms.sample(sampleId));
  const frames = useRecoilValue(atoms.sampleFrames(sampleId));
  const sampleSrc = useRecoilValue(selectors.sampleSrc(sampleId));
  const options = useRecoilValue(lookerOptions({ modal, sampleId }));
  const metadata = useRecoilValue(atoms.sampleMetadata(sampleId));
  const ref = useRef<any>();
  const bindMove = useMove((s) => ref.current && ref.current(s));
  const lookerConstructor = useRecoilValue(lookerType(sampleId));
  const initialRef = useRef<boolean>(true);

  if (frames) {
    sample = {
      ...sample,
      frames: frames,
    };
  }

  const [looker] = useState(
    () =>
      new lookerConstructor(
        sample,
        {
          src: sampleSrc,
          thumbnail: !modal,
          dimensions: [metadata.width, metadata.height],
          frameRate: metadata.frameRate,
          frameNumber: sample.frame_number,
        },
        {
          ...options,
          hasNext: Boolean(onNext),
          hasPrevious: Boolean(onPrevious),
        }
      )
  );

  useEffect(() => {
    !initialRef.current && looker.updateOptions(options);
  }, [options]);

  useEffect(() => {
    !initialRef.current && looker.updateSample(sample);
  }, [sample]);

  lookerRef && (lookerRef.current = looker);

  modal && useEventHandler(looker, "options", useLookerOptionsUpdate());
  onNext && useEventHandler(looker, "next", onNext);
  onPrevious && useEventHandler(looker, "previous", onPrevious);
  onSelectLabel && useEventHandler(looker, "select", onSelectLabel);

  useEffect(() => {
    initialRef.current = false;
  }, []);

  return (
    <>
      <div
        ref={(node) => {
          node ? looker.attach(node) : looker.detach();
        }}
        style={{ width: "100%", height: "100%", ...style }}
        onClick={onClick}
        {...bindMove()}
      />
      {modal && <TooltipInfo looker={looker} moveRef={ref} />}
    </>
  );
};

export default React.memo(Looker);
