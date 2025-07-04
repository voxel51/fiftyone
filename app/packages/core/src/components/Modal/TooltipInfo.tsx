import { IconButton, Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { isHoveringAnyLabelWithInstanceConfig } from "@fiftyone/state/src/jotai";
import CloseIcon from "@mui/icons-material/Close";
import ArrowDropDownIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import ArrowUpIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { Typography } from "@mui/material";
import { animated, useSpring } from "@react-spring/web";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import Draggable from "react-draggable";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import { joinStringArray } from "../Filters/utils";
import { ContentDiv, ContentHeader } from "../utils";

const TOOLTIP_HEADER_ID = "fo-tooltip-header";

const TooltipDiv = animated(styled(ContentDiv)<{ $isTooltipLocked: boolean }>`
  position: absolute;
  margin-top: 0;
  left: -1000;
  top: -1000;
  z-index: 20000;
  min-width: 15rem;
  pointer-events: ${(props) => (props.$isTooltipLocked ? "auto" : "none")};
`);

const TooltipContentDiv = styled.div`
  overflow-y: auto;
  max-width: 15rem;
  max-height: 40vh;

  /* Customize the scrollbar (non-standard across browsers) */
  scrollbar-width: thin;
  scrollbar-color: #888 #f0f0f0;

  &::-webkit-scrollbar {
    width: 12px;
  }

  &::-webkit-scrollbar-track {
    background: #f0f0f0; /* Color of the track (background of the scrollbar) */
  }

  &::-webkit-scrollbar-thumb {
    background-color: #888; /* color of the scrollbar thumb (the draggable part) */
    border-radius: 6px; /* roundness of the scrollbar thumb */
    border: 3px solid #f0f0f0; /* creates a border around the thumb (should match the track color) */
  }
`;

const HiddenItemsContainer = styled.div`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid ${({ theme }) => theme.border};
`;

const HiddenItemRowDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 1.5rem;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ContentItemContainer = styled.div`
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ContentItemDiv = styled.div`
  margin: 0;
  padding: 0;
  width: 100%;
`;

const VisibilityIconContainer = animated(styled.div`
  width: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-right: 0.5rem;
`);

const ContentValue = styled.div`
  font-size: 0.8rem;
  font-weight: bold;
  color: ${({ theme }) => theme.text.primary};
  text-overflow: ellipsis;
  overflow: hidden;
`;

const ContentName = styled.div`
  font-size: 0.7rem;
  font-weight: bold;
  padding-bottom: 0.3rem;
  color: ${({ theme }) => theme.text.secondary};
`;

const CtrlToLockContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 0.5em;
`;

const ShortcutRow = styled.div`
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  margin: 2px 0;
`;

const ShortcutAction = styled(Typography)`
  text-align: left;
  flex: 1;
`;

const ShortcutKey = styled.div`
  display: flex;
  align-items: center;
  margin-left: 7px;
`;

const KeyboardKey = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 1px 4px;
  margin-left: 3px;
  font-size: 0.4em;
  font-weight: 600;
  color: #333;
  min-width: 12px;
  height: 12px;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
`;

const getHiddenLabelsKey = (datasetName: string, labelName: string) => {
  return `fo-hiddenLabels-${datasetName}-${labelName}`;
};

const LABEL_CHANGE_EVENT_NAME = "fo-hide-label-change";

const getHiddenLabels = (datasetName: string, labelName: string) => {
  const hiddenLabels = localStorage.getItem(
    getHiddenLabelsKey(datasetName, labelName)
  );
  const hiddenLabelsArray = hiddenLabels ? hiddenLabels.split(",") : [];
  const sortedHiddenLabels = hiddenLabelsArray.sort();
  // insertion order is preserved, so this set can be expected to be ordered
  return new Set<string>(sortedHiddenLabels);
};

const dispatchHideLabelChangeEvent = () => {
  const event = new CustomEvent(LABEL_CHANGE_EVENT_NAME);
  window.dispatchEvent(event);
};

export const ContentItem = ({
  field,
  name,
  value,
  style,
}: {
  field: string;
  name: string;
  value?: number | string | string[];
  style?: object;
}) => {
  const datasetName = fos.useAssertedRecoilValue(fos.datasetName);
  const [isVisibilityIconVisible, setIsVisibilityIconVisible] = useState(false);
  const [isThisItemVisible, setIsThisItemVisible] = useState(true);

  const hideThisItem = useCallback(() => {
    if (name === "tags") {
      return;
    }

    const hiddenLabels = getHiddenLabels(datasetName, field);
    hiddenLabels.add(name);
    localStorage.setItem(
      getHiddenLabelsKey(datasetName, field),
      [...hiddenLabels].join(",")
    );
    setIsThisItemVisible(false);
    dispatchHideLabelChangeEvent();
  }, [datasetName, name, field]);

  const refreshHiddenLabels = useCallback(() => {
    const newHiddenLabels = getHiddenLabels(datasetName, field);
    setIsThisItemVisible(!newHiddenLabels.has(name));
  }, [datasetName, name, field]);

  useEffect(() => {
    const hiddenLabels = getHiddenLabels(datasetName, field);
    setIsThisItemVisible(!hiddenLabels.has(name));

    window.addEventListener(LABEL_CHANGE_EVENT_NAME, refreshHiddenLabels);

    return () => {
      window.removeEventListener(LABEL_CHANGE_EVENT_NAME, refreshHiddenLabels);
    };
  }, [datasetName, name, refreshHiddenLabels, field]);

  if (!isThisItemVisible || (typeof value === "object" && !value?.length)) {
    return null;
  }

  return (
    <ContentItemContainer
      onMouseEnter={() => {
        if (name !== "tags") setIsVisibilityIconVisible(true);
      }}
      onMouseLeave={() => {
        setIsVisibilityIconVisible(false);
      }}
    >
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
      <VisibilityIconContainer>
        {isVisibilityIconVisible && (
          <IconButton onClick={hideThisItem} size="small">
            <Tooltip text="Hide this label" placement="bottom-center">
              <VisibilityOffIcon fontSize="small" />
            </Tooltip>
          </IconButton>
        )}
      </VisibilityIconContainer>
    </ContentItemContainer>
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
        field={"tags"}
        key={"tags"}
        name={"tags"}
        value={tags.length ? tags.join(", ") : "No tags"}
        style={{ maxWidth: "20rem" }}
      />
    </TagBlock>
  );
};

export const TooltipInfo = React.memo(() => {
  const [isTooltipLocked, setIsTooltipLocked] = useRecoilState(
    fos.isTooltipLocked
  );
  const detail = useRecoilValue(fos.tooltipDetail);
  const coords = useRecoilValue(fos.tooltipCoordinates);
  const position = useMemo(
    () => (detail ? coords : { top: -1000, left: -1000, bottom: "unset" }),
    [coords, detail]
  );

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

  useLayoutEffect(() => {
    if (!isTooltipLocked) {
      return;
    }

    // set esc handler to unlock tooltip
    // because looker's esc handler doesn't always work
    const unlockTooltip = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsTooltipLocked(false);
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener("keyup", unlockTooltip);

    return () => {
      document.removeEventListener("keyup", unlockTooltip);
    };
  }, [isTooltipLocked]);

  useLayoutEffect(() => {
    const lockTooltip = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        setIsTooltipLocked(true);
      }
    };

    document.addEventListener("keydown", lockTooltip);

    return () => {
      document.removeEventListener("keydown", lockTooltip);
    };
  }, []);

  const tooltipDiv = useMemo(() => {
    if (!detail) {
      return null;
    }

    return (
      <TooltipDiv
        $isTooltipLocked={isTooltipLocked}
        style={{ ...coordsProps, ...showProps, position: "fixed" }}
        ref={ref}
      >
        <Header title={detail.field} />
        <Border color={detail.color} id={detail.label.id} />
        <TooltipContentDiv>
          {detail.label.tags && detail.label.tags.length > 0 && (
            <TagInfo key={"tags"} tags={detail.label?.tags} />
          )}
          <Component key={"attrs"} detail={detail} />
          {isTooltipLocked && (
            <HiddenItemsContainer>
              <HiddenItems key={detail.field} field={detail.field} />
            </HiddenItemsContainer>
          )}
        </TooltipContentDiv>
      </TooltipDiv>
    );
  }, [Component, coordsProps, detail, isTooltipLocked, showProps]);

  if (!Component) {
    return null;
  }

  if (!isTooltipLocked) {
    return ReactDOM.createPortal(tooltipDiv, document.body);
  }

  return ReactDOM.createPortal(
    <div>
      <Draggable handle={"#" + TOOLTIP_HEADER_ID}>{tooltipDiv}</Draggable>
    </div>,
    document.body
  );
});

const HiddenItems = ({ field }: { field: string }) => {
  const datasetName = fos.useAssertedRecoilValue(fos.datasetName);
  const [shouldShowHidden, setShouldShowHidden] = useState(false);

  const [currentHiddenLabels, setCurrentHiddenLabels] = useState(
    getHiddenLabels(datasetName, field)
  );

  const refreshHiddenLabels = useCallback(() => {
    setCurrentHiddenLabels(getHiddenLabels(datasetName, field));
  }, [datasetName, field]);

  useEffect(() => {
    window.addEventListener(LABEL_CHANGE_EVENT_NAME, refreshHiddenLabels);

    return () => {
      window.removeEventListener(LABEL_CHANGE_EVENT_NAME, refreshHiddenLabels);
    };
  }, [datasetName, refreshHiddenLabels]);

  if (!shouldShowHidden) {
    return (
      <Row onClick={() => setShouldShowHidden(true)}>
        <Typography variant="caption" color="gray" fontSize="0.8em">
          Hidden
        </Typography>
        <IconButton size="small">
          <ArrowDropDownIcon fontSize="small" />
        </IconButton>
      </Row>
    );
  }

  return (
    <>
      <Row onClick={() => setShouldShowHidden(false)}>
        <Typography variant="caption" color="gray" fontSize="0.8em">
          Hidden
        </Typography>
        <IconButton size="small">
          <ArrowUpIcon fontSize="small" />
        </IconButton>
      </Row>

      {currentHiddenLabels.size === 0 ? (
        <Typography variant="caption" fontSize="small">
          No items hidden
        </Typography>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[...currentHiddenLabels].map((label) => (
            <HiddenItemRow
              key={label}
              name={label}
              field={field}
              refreshHiddenLabels={refreshHiddenLabels}
            />
          ))}
        </div>
      )}
    </>
  );
};

const HiddenItemRow = ({
  name,
  field,
  refreshHiddenLabels,
}: {
  name: string;
  field: string;
  refreshHiddenLabels: () => void;
}) => {
  const datasetName = fos.useAssertedRecoilValue(fos.datasetName);
  const [showUnhideIcon, setShowUnhideIcon] = useState(false);

  const unHideItem = useCallback(() => {
    const hiddenLabels = getHiddenLabels(datasetName, field);
    hiddenLabels.delete(name);
    localStorage.setItem(
      getHiddenLabelsKey(datasetName, field),
      [...hiddenLabels].join(",")
    );
    refreshHiddenLabels();
    window.dispatchEvent(new CustomEvent(LABEL_CHANGE_EVENT_NAME));
  }, [datasetName, name, refreshHiddenLabels, field]);

  return (
    <HiddenItemRowDiv
      onMouseEnter={() => setShowUnhideIcon(true)}
      onMouseLeave={() => setShowUnhideIcon(false)}
    >
      <Typography variant="caption" color="gray">
        {name}
      </Typography>

      <VisibilityIconContainer>
        {showUnhideIcon && (
          <IconButton onClick={unHideItem} size="small">
            <Tooltip text="Show this label" placement="bottom-center">
              <VisibilityIcon fontSize="small" />
            </Tooltip>
          </IconButton>
        )}
      </VisibilityIconContainer>
    </HiddenItemRowDiv>
  );
};

const Header = ({ title }: { title: string }) => {
  const [isTooltipLocked, setIsTooltipLocked] = useRecoilState(
    fos.isTooltipLocked
  );
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);

  return (
    <ContentHeader
      $isTooltipLocked={isTooltipLocked}
      key="header"
      id={TOOLTIP_HEADER_ID}
    >
      <span style={{ fontSize: "0.8rem" }}>{title}</span>
      {isTooltipLocked ? (
        <IconButton
          size="small"
          onClick={() => {
            setTooltipDetail(null);
            setIsTooltipLocked(false);
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      ) : (
        <CtrlToLock />
      )}
    </ContentHeader>
  );
};

const CtrlToLock = () => {
  const shouldShowSimilar = isHoveringAnyLabelWithInstanceConfig();

  return (
    <CtrlToLockContainer>
      <ShortcutRow>
        <ShortcutAction variant="caption" color="gray" fontSize={"0.5rem"}>
          Lock tooltip
        </ShortcutAction>
        <ShortcutKey>
          <KeyboardKey>Ctrl</KeyboardKey>
        </ShortcutKey>
      </ShortcutRow>
      {shouldShowSimilar && (
        <ShortcutRow>
          <ShortcutAction variant="caption" color="gray" fontSize={"0.5rem"}>
            Select all
          </ShortcutAction>
          <ShortcutKey>
            <KeyboardKey>Shift</KeyboardKey>
            <KeyboardKey>Click</KeyboardKey>
          </ShortcutKey>
        </ShortcutRow>
      )}
    </CtrlToLockContainer>
  );
};

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

const AttrInfo = ({ label, field, labelType, children = null }) => {
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
    <ContentItem key={name} name={name} field={field} value={value} />
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

  // we're prettifying the instance config attributes here
  const instanceAttributes = label.instance
    ? Object.entries(label.instance)
        .filter(
          ([k, v]) =>
            typeof v === "string" &&
            v.length > 0 &&
            (k === "_id" || !k.startsWith("_"))
        )
        .map(([k, v]) => ["instance " + (k === "_id" ? "id" : k), v])
    : null;

  return (
    <>
      {defaults.map(mapper)}
      {children}
      {other.map(mapper)}
      {attributes && attributes.map(mapper)}
      {instanceAttributes && instanceAttributes.map(mapper)}
    </>
  );
};

const ClassificationInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo
        field={detail.field}
        label={detail.label}
        labelType={detail.type}
      />
    </AttrBlock>
  );
};

const DetectionInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo
        field={detail.field}
        label={detail.label}
        labelType={detail.type}
      />
    </AttrBlock>
  );
};

const HeatmapInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <ContentItem
        field={detail.field}
        key={"pixel-value"}
        name={"pixel"}
        value={detail.target}
      />
      <AttrInfo
        field={detail.field}
        label={detail.label}
        labelType={detail.type}
      />
    </AttrBlock>
  );
};

const KeypointInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo
        field={detail.field}
        label={detail.label}
        labelType={detail.type}
      />
      {detail.point && (
        <AttrInfo
          field={detail.field}
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
      <AttrInfo
        field={detail.field}
        label={detail.label}
        labelType={detail.type}
      />
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
            field={detail.field}
            name={"label"}
            value={targetValue}
          />
        ) : (
          <ContentItem
            key={"pixel-value"}
            field={detail.field}
            name={"pixel"}
            value={detail.target}
          />
        ))}
      <AttrInfo
        field={detail.field}
        label={detail.label}
        labelType={detail.type}
      />
    </AttrBlock>
  );
};

const PolylineInfo = ({ detail }) => {
  return (
    <AttrBlock style={{ borderColor: detail.color }}>
      <AttrInfo
        field={detail.field}
        label={detail.label}
        labelType={detail.type}
      />
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
  Classification: ["logits"],
  Detection: ["bounding_box", "mask"],
  Heatmap: ["map"],
  Keypoint: ["points", "occluded", "confidence"],
  Polyline: ["points"],
  Regression: [],
  Segmentation: ["mask"],
};
