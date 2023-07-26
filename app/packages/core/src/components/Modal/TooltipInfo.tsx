import { animated, useSpring } from "@react-spring/web";
import React, { useRef } from "react";
import ReactDOM from "react-dom";
import styled from "styled-components";

import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { ContentDiv, ContentHeader } from "../utils";
import { joinStringArray } from "../Filters/utils";

const TooltipDiv = animated(styled(ContentDiv)`
  position: absolute;
  margin-top: 0;
  left: -1000;
  top: -1000;
  z-index: 20000;
  pointer-events: none;
`);

const ContentItemDiv = styled.div`
  margin: 0;
  padding: 0;
  max-width: 12rem;
`;

const ContentValue = styled.div`
  font-size: 0.8rem;
  font-weight: bold;
  color: ${({ theme }) => theme.text.primary};
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
`;

const ContentName = styled.div`
  font-size: 0.7rem;
  font-weight: bold;
  padding-bottom: 0.3rem;
  color: ${({ theme }) => theme.text.secondary};
`;

export const ContentItem = ({
  name,
  value,
  style,
}: {
  name: string;
  value?: number | string | string[];
  style?: object;
}) => {
  if (typeof value === "object" && !value?.length) {
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
            case "object":
              return joinStringArray(value);
            default:
              return "None";
          }
        })()}
      </ContentValue>
      <ContentName>{name}</ContentName>
    </ContentItemDiv>
  );
};

const TagBlock = styled.div`
  margin: 0;
`;

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

export const TooltipInfo = React.memo(() => {
  const { detail, coords } = fos.useTooltip();
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

const Border = ({ color, id }) => {
  const selectedLabels = useRecoilValue(fos.selectedLabelIds);
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

const BorderDiv = styled.div`
  border-top: 2px solid ${({ theme }) => theme.text.primary};
  width: 100%;
  padding: 0.5rem 0 0;
`;

const AttrBlock = styled.div`
  padding: 0.1rem 0 0 0;
  margin: 0;
`;

const useTarget = (field, target) => {
  const getTarget = useRecoilValue(fos.getTarget);
  return getTarget(field, target);
};

const AttrInfo = ({ label, labelType, children = null }) => {
  let entries = Object.entries(label).filter(
    ([k, v]) => "tags" !== k && !k.startsWith("_")
  );
  if (!entries || !entries.length) {
    return null;
  }
  const defaultLabels =
    labelType === "Keypoint" ? ["label"] : ["label", "confidence"];
  const defaults = entries.filter(([name]) => defaultLabels.includes(name));

  const other = entries.filter(
    ([name]) =>
      ![...defaultLabels, ...HIDDEN_LABELS[labelType], "attributes"].includes(
        name
      )
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
      <AttrInfo label={detail.label} labelType={detail.type} />
    </AttrBlock>
  );
};

const DetectionInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} labelType={detail.type} />
    </AttrBlock>
  );
};

const HeatmapInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <ContentItem key={"pixel-value"} name={"pixel"} value={detail.target} />
      <AttrInfo label={detail.label} labelType={detail.type} />
    </AttrBlock>
  );
};

const KeypointInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} labelType={detail.type} />
      {detail.point && (
        <AttrInfo
          label={Object.fromEntries(
            detail.point.attributes
              .filter(([x, y]) => x !== "points")
              .map(([k, v]) => [
                `${k === "label" ? "skeleton" : k}[${detail.point.index}]`,
                v,
              ])
          )}
          labelType={detail.type}
        />
      )}
    </AttrBlock>
  );
};

const RegressionInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} labelType={detail.type} />
    </AttrBlock>
  );
};

const SegmentationInfo = ({ detail }) => {
  const targetValue = useTarget(detail.field, detail.target);
  const hideTargetValue = detail.color === undefined;

  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      {!hideTargetValue &&
        (targetValue ? (
          <ContentItem
            key={"target-value"}
            name={"label"}
            value={targetValue}
          />
        ) : (
          <ContentItem
            key={"pixel-value"}
            name={"pixel"}
            value={detail.target}
          />
        ))}
      <AttrInfo label={detail.label} labelType={detail.type} />
    </AttrBlock>
  );
};

const PolylineInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo label={detail.label} labelType={detail.type} />
    </AttrBlock>
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

const HIDDEN_LABELS = {
  Classification: ["logtis"],
  Detection: ["bounding_box", "mask"],
  Heatmap: ["map"],
  Keypoint: ["points", "occluded", "confidence"],
  Polyline: ["points"],
  Regression: [],
  Segmentation: ["mask"],
};
