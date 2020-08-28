import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";

import {
  ArrowDropDown,
  Close,
  Fullscreen,
  FullscreenExit,
} from "@material-ui/icons";
import { useRecoilState, useRecoilValue } from "recoil";

import JSONView from "./JSONView";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import { Button, ModalFooter } from "./utils";
import * as selectors from "../recoil/selectors";
import * as atoms from "../recoil/atoms";
import Filter from "./Filter";
import { Body } from "./CheckboxGrid";
import DisplayOptionsSidebar from "./DisplayOptionsSidebar";

import { useKeydownHandler, useResizeHandler } from "../utils/hooks";
import {
  stringify,
  getLabelText,
  formatMetadata,
  VALID_SCALAR_TYPES,
  VALID_CLASS_TYPES,
  VALID_OBJECT_TYPES,
  RESERVED_FIELDS,
  makeLabelNameGroups,
} from "../utils/labels";

type Props = {
  sample: object;
  sampleUrl: string;
};

const Container = styled(Body)`
  display: grid;
  grid-template-columns: 280px auto;
  width: 90vw;
  height: 80vh;
  background-color: ${({ theme }) => theme.background};

  &.fullscreen {
    width: 100vw;
    height: 100vh;
    grid-template-columns: auto;
    .sidebar {
      display: none;
    }
  }

  h2 {
    clear: both;
  }

  h2,
  h2 span {
    display: flex;
    align-items: center;
  }

  h2 .push-right {
    margin-left: auto;
  }

  h2 svg {
    cursor: pointer;
    margin-left: 5px;
  }

  h2 .close-wrapper {
    position: absolute;
    top: 1em;
    right: 1em;
    background-color: ${({ theme }) => theme.backgroundTransparent};
  }

  .player {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    .p51-video-options-panel {
      z-index: 1500;
    }
  }

  .top-right-nav-buttons {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    height: 5em;
    font-size: 150%;
    font-weight: bold;
    user-select: none;

    & > svg {
      height: 2em;
    }
  }

  .nav-button {
    position: absolute;
    z-index: 1000;
    top: 50%;
    width: 2em;
    height: 5em;
    margin-top: -2.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: ${({ theme }) => theme.overlayButton};
    cursor: pointer;
    font-size: 150%;
    font-weight: bold;
    user-select: none;

    &.left {
      left: 0;
    }
    &.right {
      right: 0;
    }
  }

  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    border-right: 2px solid ${({ theme }) => theme.border};
    max-height: 100%;
    overflow-y: auto;

    .sidebar-content {
      padding-left: 1em;
      padding-right: 1em;
      padding-bottom: 1em;
      flex-grow: 1;
      overflow-y: auto;
    }

    ${ModalFooter} {
      align-items: flex-start;
    }
  }

  .row {
    > label {
      font-weight: bold;
    }
    > span {
      float: right;
    }
    span {
      word-wrap: break-word;
    }
  }
`;

const TopRightNavButtonsContainer = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
`;

const TopRightNavButtons = ({ children }) => {
  return <TopRightNavButtonsContainer>{children}</TopRightNavButtonsContainer>;
};

const TopRightNavButtonContainer = styled.div`
  display: block;
  background-color: ${({ theme }) => theme.overlayButton};
  cursor: pointer;
  font-size: 150%;
  font-weight: bold;
  user-select: none;
  width: 2em;
  margin-top: 0;
  height: 2em;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TopRightNavButton = ({ icon, title, onClick }) => {
  return (
    <TopRightNavButtonContainer title={title} onClick={onClick}>
      {icon}
    </TopRightNavButtonContainer>
  );
};

const Row = ({ name, renderedName, value, children, ...rest }) => (
  <div className="row" {...rest}>
    <label>{renderedName || name}&nbsp;</label>
    <span style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{value}</span>
      {children}
    </span>
  </div>
);

const LabelRow = ({ color, field, ...rest }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeLabels, setActiveLabels] = useRecoilState(
    atoms.modalActiveLabels
  );
  return (
    <React.Fragment key={rest.key}>
      <Row {...rest}>
        {activeLabels[rest.name] && field._cls && (
          <ArrowDropDown
            onClick={(e) => {
              e.preventDefault();
              setExpanded(!expanded);
            }}
            style={{
              lineHeight: "31px",
              cursor: "pointer",
            }}
          />
        )}
      </Row>
      {expanded && activeLabels[rest.name] && (
        <Filter
          key={`${rest.key}-filter`}
          style={{
            margin: "0.5rem 0",
            border: "1px solid hsl(200,2%,37%)",
          }}
          entry={{
            name: rest.name,
            color,
            selected: activeLabels[rest.name],
          }}
          {...{
            includeLabels: atoms.modalFilterIncludeLabels,
            invertInclude: atoms.modalFilterInvertIncludeLabels,
            includeNoConfidence: atoms.modalFilterLabelIncludeNoConfidence,
            confidenceRange: atoms.modalFilterLabelConfidenceRange,
          }}
        />
      )}
    </React.Fragment>
  );
};

const SampleModal = ({
  sample,
  sampleUrl,
  colorMapping = {},
  onClose,
  onPrevious,
  onNext,
  ...rest
}: Props) => {
  const playerContainerRef = useRef();
  const [playerStyle, setPlayerStyle] = useState({ height: "100%" });
  const [showJSON, setShowJSON] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeLabels, setActiveLabels] = useRecoilState(
    atoms.modalActiveLabels
  );
  const [activeTags, setActiveTags] = useRecoilState(atoms.modalActiveTags);
  const [activeOther, setActiveOther] = useRecoilState(atoms.modalActiveOther);
  const fieldSchema = useRecoilValue(selectors.fieldSchema);
  const labelNames = useRecoilValue(selectors.labelNames);
  const labelTypes = useRecoilValue(selectors.labelTypes);
  const labelNameGroups = makeLabelNameGroups(
    fieldSchema,
    labelNames,
    labelTypes
  );
  useEffect(() => {
    setActiveLabels(rest.activeLabels);
  }, [rest.activeLabels]);

  const handleResize = () => {
    if (!playerContainerRef.current || showJSON) {
      return;
    }
    const container = playerContainerRef.current;
    const image = playerContainerRef.current.querySelector(
      "img.p51-contained-image"
    );
    const containerRatio = container.clientWidth / container.clientHeight;
    const imageRatio = image.clientWidth / image.clientHeight;
    if (containerRatio < imageRatio) {
      setPlayerStyle({
        width: container.clientWidth,
        height: container.clientWidth / imageRatio,
      });
    } else {
      setPlayerStyle({
        height: container.clientHeight,
        width: container.clientHeight * imageRatio,
      });
    }
  };

  useResizeHandler(handleResize, [showJSON]);
  useEffect(handleResize, [showJSON, fullscreen]);

  useKeydownHandler(
    (e) => {
      if (e.key == "Escape") {
        if (fullscreen) {
          setFullscreen(false);
        } else if (onClose) {
          onClose();
        }
      } else if (e.key == "ArrowLeft" && onPrevious) {
        onPrevious();
      } else if (e.key == "ArrowRight" && onNext) {
        onNext();
      }
    },
    [onClose, onPrevious, onNext, fullscreen]
  );

  const makeTag = (name) => (
    <Tag
      key={name}
      name={name}
      color={colorMapping[name]}
      outline={!activeLabels[name]}
      onClick={() =>
        setActiveLabels({ ...activeLabels, [name]: !activeLabels[name] })
      }
    />
  );

  const classifications = Object.keys(sample)
    .filter((k) => sample[k] && VALID_CLASS_TYPES.includes(sample[k]._cls))
    .map((k) => {
      let value;
      if (sample[k].classifications) {
        const len = sample[k].classifications.length;
        value = `${len} classification${len == 1 ? "" : "s"}`;
      } else {
        value = getLabelText(sample[k]);
      }
      return {
        key: k,
        name: k,
        field: sample[k],
        renderedName: makeTag(k),
        value,
        color: colorMapping[k],
      };
    });
  const detections = Object.keys(sample)
    .filter((k) => sample[k] && VALID_OBJECT_TYPES.includes(sample[k]._cls))
    .map((k) => {
      const len = sample[k].detections ? sample[k].detections.length : 1;
      return {
        key: k,
        name: k,
        renderedName: makeTag(k),
        field: sample[k],
        value: `${len} detection${len == 1 ? "" : "s"}`,
        color: colorMapping[k],
      };
    });
  const labels = [...classifications, ...detections]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(LabelRow);
  const scalars = Object.keys(sample)
    .filter(
      (k) =>
        VALID_SCALAR_TYPES.includes(fieldSchema[k]) &&
        !RESERVED_FIELDS.includes(k) &&
        sample[k] !== null &&
        sample[k] !== undefined
    )
    .map((k) => {
      return (
        <Row key={k} renderedName={makeTag(k)} value={stringify(sample[k])} />
      );
    });

  return (
    <Container className={fullscreen ? "fullscreen" : ""}>
      <div className="sidebar">
        <div className="sidebar-content">
          <h2>
            Metadata
            <span className="push-right" />
          </h2>
          <Row name="ID" value={sample._id.$oid} />
          <Row name="Source" value={sample.filepath} />
          {formatMetadata(sample.metadata).map(({ name, value }) => (
            <Row key={"metadata-" + name} name={name} value={value} />
          ))}
          <DisplayOptionsSidebar
            colorMapping={colorMapping}
            tags={getDisplayOptions(
              tagNames.map((t) => ({ name: t })),
              tagSampleCounts,
              activeTags
            )}
            labels={getDisplayOptions(
              labelNameGroups.labels,
              labelSampleCounts,
              activeLabels
            )}
            onSelectTag={handleSetDisplayOption(setActiveTags)}
            onSelectLabel={handleSetDisplayOption(setActiveLabels)}
            scalars={getDisplayOptions(
              labelNameGroups.scalars,
              labelSampleCounts,
              activeOther
            )}
            onSelectScalar={handleSetDisplayOption(setActiveOther)}
            unsupported={getDisplayOptions(
              labelNameGroups.unsupported,
              labelSampleCounts,
              activeLabels
            )}
            style={{
              maxHeight: sidebarHeight,
              overflowY: "auto",
              overflowX: "hidden",
              paddingRight: 25,
              marginRight: -25,
              scrollbarWidth: "thin",
            }}
            ref={sidebarRef}
          />
        </div>
        <ModalFooter>
          <Button onClick={() => setShowJSON(!showJSON)}>
            {showJSON ? "Hide" : "Show"} JSON
          </Button>
        </ModalFooter>
      </div>
      <div className="player" ref={playerContainerRef}>
        {showJSON ? (
          <JSONView object={sample} />
        ) : (
          <Player51
            key={sampleUrl} // force re-render when this changes
            src={sampleUrl}
            onLoad={handleResize}
            style={{
              position: "relative",
              ...playerStyle,
            }}
            sample={sample}
            colorMapping={colorMapping}
            activeLabels={activeLabels}
            fieldSchema={fieldSchema}
            filterSelector={selectors.modalLabelFilters}
          />
        )}
        {onPrevious ? (
          <div
            className="nav-button left"
            onClick={onPrevious}
            title="Previous sample (Left arrow)"
          >
            &lt;
          </div>
        ) : null}
        {onNext ? (
          <div
            className="nav-button right"
            onClick={onNext}
            title="Next sample (Right arrow)"
          >
            &gt;
          </div>
        ) : null}
        <TopRightNavButtons>
          <TopRightNavButton
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? "Unmaximize (Esc)" : "Maximize"}
            icon={fullscreen ? <FullscreenExit /> : <Fullscreen />}
          />
          <TopRightNavButton
            onClick={onClose}
            title={"Close"}
            icon={<Close />}
          />
        </TopRightNavButtons>
      </div>
    </Container>
  );
};

export default SampleModal;
