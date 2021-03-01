import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";

import { Close, Fullscreen, FullscreenExit } from "@material-ui/icons";
import { useRecoilValue, useSetRecoilState } from "recoil";

import FieldsSidebar from "./FieldsSidebar";
import JSONView from "./JSONView";
import Player51 from "./Player51";
import SelectObjectsMenu from "./SelectObjectsMenu";
import { ModalFooter } from "./utils";
import * as selectors from "../recoil/selectors";
import * as atoms from "../recoil/atoms";
import * as labelAtoms from "./Filters/utils";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import { SampleContext } from "../utils/context";

import {
  useEventHandler,
  useKeydownHandler,
  useResizeHandler,
  useVideoData,
} from "../utils/hooks";
import { formatMetadata } from "../utils/labels";
import { useToggleSelectionObject } from "../utils/selection";
import { Button, ColorByLabel, RefreshButton } from "./ImageContainerHeader";

const Container = styled.div`
  position: relative;
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
    &:hover {
      background-color: ${({ theme }) => theme.overlayButtonHover};
    }
  }

  .sidebar {
    position: relative;
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
      scrollbar-width: none;
      @-moz-document url-prefix() {
        padding-right: 16px;
      }
    }

    .sidebar-content::-webkit-scrollbar {
      width: 0px;
      background: transparent;
      display: none;
    }
    .sidebar-content::-webkit-scrollbar-thumb {
      width: 0px;
      display: none;
    }
  }

  .row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    flex-wrap: wrap;

    > label {
      font-weight: bold;
      display: block;
      padding-right: 0.5rem;
      width: auto;
    }
    > div {
      display: block;
      max-width: 100%;
    }
    span {
      flex-grow: 2;
      overflow-wrap: break-word;
      vertical-align: middle;
    }
  }

  .select-objects-wrapper {
    margin-top: -1em;
  }
`;

const TopRightNavButtonsContainer = styled.div`
  position: absolute;
  z-index: 1000;
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
  &:hover {
    background-color: ${({ theme }) => theme.overlayButtonHover};
  }
`;

const TopRightNavButton = ({ icon, title, onClick, ...rest }) => {
  return (
    <TopRightNavButtonContainer title={title} onClick={onClick} {...rest}>
      {icon}
    </TopRightNavButtonContainer>
  );
};

type RowProps = {
  name: string;
  value: string;
  style?: any;
  children?: React.ReactElement<any>[];
};

const Row = ({ name, value, children, ...rest }: RowProps) => (
  <div className="row" {...rest}>
    <label>{name}&nbsp;</label>
    <div>
      <span title={value}>{value}</span>
    </div>
    {children}
  </div>
);

type Props = {
  sample: object;
  sampleUrl: string;
  colorMap: { [key: string]: string };
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
};

const SampleModal = (
  { sampleUrl, onClose, onNext, onPrevious }: Props,
  ref
) => {
  const { sample } = useRecoilValue(atoms.modal);
  const playerContainerRef = useRef();
  const [playerStyle, setPlayerStyle] = useState({
    height: "100%",
    width: "100%",
  });
  const colorMap = useRecoilValue(selectors.colorMap(true));
  const setModalFilters = useSetRecoilState(labelFilters(true));
  const [showJSON, setShowJSON] = useState(false);
  const [enableJSONFilter, setEnableJSONFilter] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const mediaType = useRecoilValue(selectors.mediaType);
  const fieldSchema = useRecoilValue(selectors.fieldSchema("sample"));
  const colorByLabel = useRecoilValue(atoms.colorByLabel(true));
  const socket = useRecoilValue(selectors.socket);
  const viewCounter = useRecoilValue(atoms.viewCounter);
  const [requested, requestLabels] = useVideoData(socket, sample);
  const videoLabels = useRecoilValue(atoms.sampleVideoLabels(sample._id));
  useEffect(() => {
    mediaType === "video" && requested !== viewCounter && requestLabels();
  }, [requested]);
  useEffect(() => {
    setModalFilters(null);
  }, []);

  const toggleSelectedObject = useToggleSelectionObject(atoms.selectedObjects);
  const selectedObjectIDs = Array.from(
    useRecoilValue(selectors.selectedObjectIds)
  );

  // save overlay options when navigating - these are restored by passing them
  // in defaultOverlayOptions when the new player is created
  const playerRef = useRef();

  const handleResize = () => {
    if (!playerRef.current || !playerContainerRef.current || showJSON) {
      return;
    }
    const container = playerContainerRef.current;
    const containerRatio = container.clientWidth / container.clientHeight;
    const contentDimensions = playerRef.current.getContentDimensions();
    if (
      !contentDimensions ||
      contentDimensions.width === 0 ||
      contentDimensions.height === 0
    ) {
      // content may not have loaded yet
      return;
    }
    const contentRatio = contentDimensions.width / contentDimensions.height;
    if (containerRatio < contentRatio) {
      setPlayerStyle({
        width: container.clientWidth,
        height: container.clientWidth / contentRatio,
      });
    } else {
      setPlayerStyle({
        height: container.clientHeight,
        width: container.clientHeight * contentRatio,
      });
    }
  };

  useResizeHandler(handleResize);
  useEffect(handleResize, [sampleUrl, showJSON, fullscreen]);

  useKeydownHandler((e) => {
    if (
      document.activeElement &&
      ((document.activeElement.tagName.toLowerCase() === "input" &&
        !["checkbox", "radio"].includes(document.activeElement.type)) ||
        document.activeElement.getAttribute("role") === "slider")
    ) {
      return;
    } else if (e.key == "Escape") {
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
  });

  // store in a ref to avoid re-rendering this component when the frame number
  // changes
  const frameNumberRef = useRef(null);
  useEventHandler(playerRef.current, "timeupdate", (e) => {
    frameNumberRef.current = e.data.frame_number;
  });

  return (
    <SampleContext.Provider value={sample}>
      <Container
        style={{ zIndex: 10001 }}
        className={fullscreen ? "fullscreen" : ""}
        ref={ref}
      >
        <div className="player" ref={playerContainerRef}>
          {showJSON ? (
            <JSONView
              object={sample}
              filterJSON={enableJSONFilter}
              enableFilter={setEnableJSONFilter}
            />
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
              keep={true}
              overlay={videoLabels}
              colorByLabel={colorByLabel}
              activeLabelsAtom={labelAtoms.activeFields(true)}
              fieldSchema={fieldSchema}
              filterSelector={labelFilters(true)}
              playerRef={playerRef}
              selectedObjects={selectedObjectIDs}
              onSelectObject={({ id, name }) => {
                toggleSelectedObject(id, {
                  sample_id: sample._id,
                  field: name,
                  frame_number: frameNumberRef.current,
                });
              }}
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
          </TopRightNavButtons>
        </div>
        <div className="sidebar">
          <div className="sidebar-content">
            <h2>
              Metadata
              <span className="push-right" />
            </h2>
            <Row name="ID" value={sample._id} />
            <Row name="Source" value={sample.filepath} />
            <Row name="Media type" value={sample._media_type} />
            {formatMetadata(sample.metadata).map(({ name, value }) => (
              <Row key={"metadata-" + name} name={name} value={value} />
            ))}
            <h2>
              Fields
              <span className="push-right" />
            </h2>
            <div className="select-objects-wrapper">
              <SelectObjectsMenu
                sample={sample}
                frameNumberRef={frameNumberRef}
              />
            </div>
            <FieldsSidebar
              modal={true}
              style={{
                overflowY: "auto",
                overflowX: "hidden",
                height: "auto",
              }}
            />
            <TopRightNavButton
              onClick={onClose}
              title={"Close"}
              icon={<Close />}
              style={{ position: "absolute", top: 0, right: 0 }}
            />
          </div>
          <ModalFooter style={{ display: "block" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <Button
                onClick={() => setShowJSON(!showJSON)}
                text={`${showJSON ? "Hide" : "Show"} JSON`}
              />
              <RefreshButton />
            </div>
            <ColorByLabel
              style={{ borderWidth: 0, marginTop: "1rem" }}
              modal={true}
            />
          </ModalFooter>
        </div>
      </Container>
    </SampleContext.Provider>
  );
};

export default React.forwardRef(SampleModal);
