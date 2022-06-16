import React, { useState, useRef, MutableRefObject, useEffect } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";
import {
  useRecoilValue,
  useRecoilCallback,
  selector,
  useRecoilValueLoadable,
} from "recoil";
import { animated, useSpring } from "@react-spring/web";
import { v4 as uuid } from "uuid";

import { ContentDiv, ContentHeader } from "./utils";
import { useEventHandler, useSelectSample } from "../utils/hooks";
import { getMimeType } from "../utils/generic";

import { pathFilter } from "./Filters";
import * as atoms from "../recoil/atoms";
import * as colorAtoms from "../recoil/color";
import * as filterAtoms from "../recoil/filters";
import * as schemaAtoms from "../recoil/schema";
import * as selectors from "../recoil/selectors";
import { State } from "../recoil/types";
import * as viewAtoms from "../recoil/view";
import { getSampleSrc, lookerType } from "../recoil/utils";
import { ModalActionsRow } from "./Actions";
import { useErrorHandler } from "react-error-boundary";
import { Field, LIST_FIELD } from "@fiftyone/utilities";
import { Checkbox } from "@material-ui/core";
import { useTheme } from "@fiftyone/components";
import { skeletonFilter } from "./Filters/utils";
import { PluginComponentType, usePlugin } from "@fiftyone/plugins";

const Header = styled.div`
  position: absolute;
  cursor: pointer;
  top: 0;
  display: flex;
  padding: 0.5rem;
  justify-content: space-between;
  overflow: visible;
  width: 100%;
  z-index: 1000;

  background-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0),
    30%,
    ${({ theme }) => theme.backgroundDark}
  );
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
  if (typeof value === "object") {
    return null;
  }

  return (
    <ContentItemDiv style={style}>
      <ContentValue>
        {(() => {
          switch (typeof value) {
            case "number":
              return Number.isInteger(value) ? value : value.toFixed(3);
            case "string":
              return value.length ? value : '""';
            case "boolean":
              return value ? "True" : "False";
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

const AttrInfo = ({ label, children = null }) => {
  let entries = Object.entries(label).filter(
    ([k, v]) => "tags" !== k && !k.startsWith("_")
  );
  if (!entries || !entries.length) {
    return null;
  }

  const defaults = entries.filter(([name]) =>
    ["label", "confidence"].includes(name)
  );

  const other = entries.filter(
    ([name]) => !["label", "confidence"].includes(name)
  );
  const mapper = ([name, value]) => (
    <ContentItem key={name} name={name} value={value} />
  );

  const attributes =
    typeof label.attributes === "object"
      ? Object.entries(
          label.attributes as { [key: string]: { value: string | number } }
        ).map<[string, string | number]>(([k, v]) => [
          "attributes." + k,
          v.value,
        ])
      : null;

  return (
    <>
      {defaults.map(mapper)}
      {children}
      {other.map(mapper)}
      {attributes && attributes.map(mapper)}
    </>
  );
};

const ClassificationInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const DetectionInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const HeatmapInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <ContentItem key={"pixel-value"} name={"pixel"} value={detail.target} />
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const KeypointInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
      {detail.point && (
        <AttrInfo
          label={Object.fromEntries(
            detail.point.attributes.map(([k, v]) => [
              `points[${detail.point.index}].${k}`,
              v,
            ])
          )}
        />
      )}
    </AttrBlock>
  );
};

const RegressionInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const SegmentationInfo = ({ detail }) => {
  const targetValue = useTarget(detail.field, detail.target);

  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      {targetValue ? (
        <ContentItem key={"target-value"} name={"label"} value={targetValue} />
      ) : (
        <ContentItem key={"pixel-value"} name={"pixel"} value={detail.target} />
      )}
      <AttrInfo label={detail.label} />
    </AttrBlock>
  );
};

const PolylineInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} />
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
  Heatmap: HeatmapInfo,
  Keypoint: KeypointInfo,
  Polyline: PolylineInfo,
  Regression: RegressionInfo,
  Segmentation: SegmentationInfo,
};

const TagInfo = ({ tags }: { tags: string[] }) => {
  if (!tags) {
    return null;
  }
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

const TooltipInfo = React.memo(({ looker }: { looker: any }) => {
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
          <Border color={detail.color} id={detail.label.id} />
          {detail.label.tags && detail.label.tags.length > 0 && (
            <TagInfo key={"tags"} tags={detail.label?.tags} />
          )}
          <Component key={"attrs"} detail={detail} />
        </TooltipDiv>,
        document.body
      )
    : null;
});

type EventCallback = (event: CustomEvent) => void;

const lookerOptions = selector({
  key: "lookerOptions",
  get: ({ get }) => {
    const showConfidence = get(
      selectors.appConfigOption({ modal: true, key: "showConfidence" })
    );
    const showIndex = get(
      selectors.appConfigOption({ modal: true, key: "showIndex" })
    );
    const showLabel = get(
      selectors.appConfigOption({ modal: true, key: "showLabel" })
    );
    const showTooltip = get(
      selectors.appConfigOption({ modal: true, key: "showTooltip" })
    );
    const useFrameNumber = get(
      selectors.appConfigOption({ modal: true, key: "useFrameNumber" })
    );
    const video = get(selectors.isVideoDataset)
      ? {
          loop: get(
            selectors.appConfigOption({ modal: true, key: "loopVideos" })
          ),
        }
      : {};
    const zoom = get(viewAtoms.isPatchesView)
      ? get(atoms.cropToContent(true))
      : false;

    return {
      activePaths: get(schemaAtoms.activeFields({ modal: true })),
      showConfidence,
      showControls: true,
      showIndex,
      showLabel,
      useFrameNumber,
      showTooltip,
      ...video,
      zoom,
      filter: get(pathFilter(true)),
      ...get(atoms.savedLookerOptions),
      selectedLabels: [...get(selectors.selectedLabelIds)],
      fullscreen: get(atoms.fullscreen),
      showOverlays: get(atoms.showOverlays),
      timeZone: get(selectors.timeZone),
      coloring: get(colorAtoms.coloring(true)),
      alpha: get(atoms.alpha(true)),
      showSkeletons: get(
        selectors.appConfigOption({ key: "showSkeletons", modal: true })
      ),
      defaultSkeleton: get(atoms.dataset).defaultSkeleton,
      skeletons: Object.fromEntries(
        get(atoms.dataset)?.skeletons.map(({ name, ...rest }) => [name, rest])
      ),
      pointFilter: get(skeletonFilter(true)),
    };
  },
});
3;
const useLookerOptionsUpdate = () => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (event: CustomEvent) => {
        const currentOptions = await snapshot.getPromise(
          atoms.savedLookerOptions
        );
        set(atoms.savedLookerOptions, { ...currentOptions, ...event.detail });
      }
  );
};

const useFullscreen = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(atoms.fullscreen, event.detail);
  });
};

const useShowOverlays = () => {
  return useRecoilCallback(({ set }) => async (event: CustomEvent) => {
    set(atoms.showOverlays, event.detail);
  });
};

const useClearSelectedLabels = () => {
  return useRecoilCallback(
    ({ set }) =>
      async () =>
        set(atoms.selectedLabels, {}),
    []
  );
};

interface LookerProps {
  lookerRef?: MutableRefObject<any>;
  onClose?: EventCallback;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onNext?: EventCallback;
  onPrevious?: EventCallback;
  onSelectLabel?: EventCallback;
  style?: React.CSSProperties;
}

const Looker = ({
  lookerRef,
  onClose,
  onNext,
  onPrevious,
  onSelectLabel,
  style,
}: LookerProps) => {
  const [id] = useState(() => uuid());
  const { sample, dimensions, frameRate, frameNumber, url } = useRecoilValue(
    atoms.modal
  );
  const isClips = useRecoilValue(viewAtoms.isClipsView);
  const mimetype = getMimeType(sample);
  const sampleSrc = getSampleSrc(sample.filepath, sample._id, url);
  const { contents: options } = useRecoilValueLoadable(lookerOptions);
  const theme = useTheme();
  const getLookerConstructor = useRecoilValue(lookerType);
  const initialRef = useRef<boolean>(true);
  const fieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.SAMPLE, filtered: true })
  );
  const frameFieldSchema = useRecoilValue(
    schemaAtoms.fieldSchema({ space: State.SPACE.FRAME, filtered: true })
  );
  const view = useRecoilValue(viewAtoms.view);
  const dataset = useRecoilValue(selectors.datasetName);

  const hasFrames = Boolean(Object.keys(frameFieldSchema).length);

  const [looker] = useState(() => {
    const constructor = getLookerConstructor(mimetype);
    const etc = isClips ? { support: sample.support } : {};

    return new constructor(
      sample,
      {
        src: sampleSrc,
        dimensions,
        frameRate,
        frameNumber,
        sampleId: sample._id,
        thumbnail: false,
        fieldSchema: hasFrames
          ? {
              ...fieldSchema,
              frames: {
                fields: frameFieldSchema,
                ftype: LIST_FIELD,
              } as Field,
            }
          : fieldSchema,
        view,
        dataset,
        ...etc,
      },
      {
        ...options,
        hasNext: Boolean(onNext),
        hasPrevious: Boolean(onPrevious),
      }
    );
  });

  useEffect(() => {
    !initialRef.current && looker.updateOptions(options);
  }, [options]);

  useEffect(() => {
    !initialRef.current && looker.updateSample(sample);
  }, [sample]);

  useEffect(() => {
    return () => looker && looker.destroy();
  }, [looker]);

  const handleError = useErrorHandler();
  lookerRef && (lookerRef.current = looker);
  const moveRef = useRef<HTMLElement>();
  const headerRef = useRef<HTMLElement>();
  useEventHandler(looker, "options", useLookerOptionsUpdate());
  useEventHandler(looker, "fullscreen", useFullscreen());
  useEventHandler(looker, "showOverlays", useShowOverlays());

  onNext && useEventHandler(looker, "next", onNext);
  onPrevious && useEventHandler(looker, "previous", onPrevious);
  onClose && useEventHandler(looker, "close", onClose);
  onSelectLabel && useEventHandler(looker, "select", onSelectLabel);
  useEventHandler(looker, "error", (event) => handleError(event.detail));
  const onSelect = useSelectSample();
  const selected = useRecoilValue(atoms.selectedSamples);

  useEffect(() => {
    initialRef.current = false;
  }, []);

  const [plugin] = usePlugin(PluginComponentType.SampleModalContent);
  const pluginAPI = {
    getSampleSrc,
    sample,
    dataset: useRecoilValue(atoms.dataset),
  };
  const pluginIsActive = plugin && plugin.activator(pluginAPI);
  const PluginComponent = pluginIsActive && plugin.component;

  useEffect(() => {
    if (!pluginIsActive) {
      looker.attach(id);
    }
  }, [id]);

  useEventHandler(looker, "clear", useClearSelectedLabels());

  const isSelected = selected.has(sample._id);

  const select = () => onSelect(sample._id);

  return (
    <div
      id={id}
      style={{
        width: "100%",
        height: "100%",
        background: theme.backgroundDark,
        ...style,
      }}
      onMouseMove={(event) => (moveRef.current = event.target as HTMLElement)}
    >
      {options.showControls && (
        <Header
          ref={headerRef}
          onClick={() => event.target === headerRef.current && select()}
        >
          <Checkbox
            disableRipple
            title={isSelected ? "Select sample" : "Selected"}
            checked={isSelected}
            style={{ color: theme.brand }}
            onClick={select}
          />
          <ModalActionsRow lookerRef={lookerRef} />
        </Header>
      )}
      {PluginComponent && <PluginComponent api={pluginAPI} />}
      {<TooltipInfo looker={looker} />}
    </div>
  );
};

export default React.memo(Looker);
