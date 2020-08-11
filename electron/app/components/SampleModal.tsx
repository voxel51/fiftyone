import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";

import { Close, Fullscreen, FullscreenExit } from "@material-ui/icons";

import JSONView from "./JSONView";
import Player51 from "./Player51";
import Tag from "./Tags/Tag";
import { Button, ModalFooter } from "./utils";

import { useKeydownHandler, useResizeHandler } from "../utils/hooks";
import {
  stringify,
  getLabelText,
  formatMetadata,
  VALID_SCALAR_TYPES,
  VALID_CLASS_TYPES,
  VALID_OBJECT_TYPES,
  RESERVED_FIELDS,
} from "../utils/labels";

type Props = {
  sample: object;
  sampleUrl: string;
};

const Container = styled.div`
  display: grid;
  grid-template-columns: auto 280px;
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

  .player {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
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

    &.fullscreen {
      right: 0;
      top: 0;
      margin-top: 0;
      height: 2em;
    }
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    border-left: 2px solid ${({ theme }) => theme.border};
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
  }
`;

const Row = ({ name, value }) => (
  <div className="row">
    <label>{name}</label>
    <span>{value}</span>
  </div>
);

const SampleModal = ({
  sample,
  sampleUrl,
  activeLabels,
  fieldSchema = {},
  colorMapping = {},
  onClose,
  onPrevious,
  onNext,
}: Props) => {
  const playerContainerRef = useRef();
  const [playerStyle, setPlayerStyle] = useState({ height: "100%" });
  const [showJSON, setShowJSON] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

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

  const classifications = Object.keys(sample)
    .filter((k) => sample[k] && VALID_CLASS_TYPES.includes(sample[k]._cls))
    .map((k) => (
      <Row
        key={k}
        name={<Tag name={k} color={colorMapping[k]} />}
        value={getLabelText(sample[k])}
      />
    ));
  const detections = Object.keys(sample)
    .filter((k) => sample[k] && VALID_OBJECT_TYPES.includes(sample[k]._cls))
    .map((k) => {
      const len = sample[k].detections ? sample[k].detections.length : 1;
      return (
        <Row
          key={k}
          name={<Tag name={k} color={colorMapping[k]} />}
          value={`${len} detection${len == 1 ? "" : "s"}`}
        />
      );
    });
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
        <Row
          key={k}
          name={<Tag name={k} color={colorMapping[k]} />}
          value={stringify(sample[k])}
        />
      );
    });

  return (
    <Container className={fullscreen ? "fullscreen" : ""}>
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
        {fullscreen ? (
          <div
            className="nav-button fullscreen"
            title="Exit full screen (Esc)"
            onClick={() => setFullscreen(false)}
          >
            <FullscreenExit />
          </div>
        ) : null}
      </div>
      <div className="sidebar">
        <div className="sidebar-content">
          <h2>
            Metadata
            <span className="push-right" />
            <span title="Full screen">
              <Fullscreen onClick={() => setFullscreen(true)} />
            </span>
            <span title="Close">
              <Close onClick={onClose} />
            </span>
          </h2>
          <Row name="ID" value={sample._id.$oid} />
          <Row name="Source" value={sample.filepath} />
          {formatMetadata(sample.metadata).map(({ name, value }) => (
            <Row name={name} value={value} />
          ))}
          <Row
            name="Tags"
            value={
              sample.tags.length
                ? sample.tags.map((tag) => (
                    <Tag key={tag} name={tag} color={colorMapping[tag]} />
                  ))
                : "none"
            }
          />
          {classifications.length ? (
            <>
              <h2>Classification</h2>
              {classifications}
            </>
          ) : null}
          {detections.length ? (
            <>
              <h2>Object Detection</h2>
              {detections}
            </>
          ) : null}
          {scalars.length ? (
            <>
              <h2>Scalars</h2>
              {scalars}
            </>
          ) : null}
        </div>
        <ModalFooter>
          <Button onClick={() => setShowJSON(!showJSON)}>
            {showJSON ? "Hide" : "Show"} JSON
          </Button>
        </ModalFooter>
      </div>
    </Container>
  );
};

export default SampleModal;
