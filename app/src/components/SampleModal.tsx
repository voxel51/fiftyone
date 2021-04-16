import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { Close, Fullscreen, FullscreenExit } from "@material-ui/icons";
import {
  useRecoilValue,
  useSetRecoilState,
  useRecoilState,
  selector,
  useRecoilCallback,
} from "recoil";

import Actions from "./Actions";
import FieldsSidebar from "./FieldsSidebar";
import * as labelAtoms from "./Filters/utils";
import { labelFilters } from "./Filters/LabelFieldFilters.state";
import JSONView from "./JSONView";
import Player51 from "./Player51";
import { ModalFooter } from "./utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import socket, { http } from "../shared/connection";
import {
  useEventHandler,
  useKeydownHandler,
  useResizeHandler,
  useVideoData,
  useTheme,
} from "../utils/hooks";
import { formatMetadata } from "../utils/labels";

const modalSrc = selector<string>({
  key: "modalSrc",
  get: ({ get }) => {
    const sample = get(selectors.modalSample);
    if (sample) {
      return `${http}/filepath/${encodeURI(sample.filepath)}?id=${sample._id}`;
    }
  },
});

const modalIndex = selector<number>({
  key: "modalIndex",
  get: ({ get }) => {
    const { sample_id } = get(atoms.modal);
    return get(selectors.sampleIndices)[sample_id];
  },
  set: ({ get, set }, value) => {
    if (typeof value !== "number") {
      value = 0;
    }
    set(atoms.modal, {
      visible: true,
      sample_id: get(selectors.sampleIds)[value],
    });
  },
});

const Container = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: auto 296px;
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
    margin: 0.5rem -1rem;
    padding: 0 1rem;
    border-bottom: 2px solid ${({ theme }) => theme.backgroundLight};
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
    height: 100%;
    max-height: 100%;
    overflow: hidden;
    border-left: 2px solid ${({ theme }) => theme.border};

    .sidebar-content {
      padding-left: 1rem;
      padding-right: 1rem;
      overflow-y: scroll;
      flex-grow: 1;
      overflow-y: auto;
      height: calc(100% - 64.5px);
      max-height: calc(100% - 64.5px);
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
  onClose: () => void;
};

const onSelectLabel = (frameNumberRef) => {
  return useRecoilCallback(
    ({ snapshot, set }) => async ({ id, name }) => {
      const { sample_id } = await snapshot.getPromise(atoms.modal);
      let labels = { ...(await snapshot.getPromise(selectors.selectedLabels)) };
      if (labels[id]) {
        delete labels[id];
      } else {
        labels[id] = {
          field: name,
          sample_id,
          frame_number: frameNumberRef.current,
        };
      }
      set(selectors.selectedLabels, labels);
    },
    [frameNumberRef]
  );
};

const SampleModal = ({ onClose }: Props, ref) => {
  const sample = useRecoilValue(selectors.modalSample);
  const sampleUrl = useRecoilValue(modalSrc);
  const [index, setIndex] = useRecoilState(modalIndex);
  const numSamples = useRecoilValue(selectors.currentSamplesSize);
  const playerContainerRef = useRef();
  const [playerStyle, setPlayerStyle] = useState({
    height: "100%",
    width: "100%",
  });
  const setModalFilters = useSetRecoilState(labelFilters(true));
  const showJSON = useRecoilValue(atoms.showModalJSON);
  const [enableJSONFilter, setEnableJSONFilter] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const fieldSchema = useRecoilValue(selectors.fieldSchema("sample"));
  const colorByLabel = useRecoilValue(atoms.colorByLabel(true));
  const requestLabels = useVideoData(socket, sample._id);
  const videoLabels = useRecoilValue(atoms.sampleVideoLabels(sample._id));
  useEffect(() => {
    setModalFilters(null);
    requestLabels();
  }, []);

  const selectedLabelIds = Array.from(
    useRecoilValue(selectors.selectedLabelIds)
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
    } else if (e.key == "ArrowLeft" && index > 0) {
      setIndex(index - 1);
    } else if (e.key == "ArrowRight" && index < numSamples - 1) {
      setIndex(index + 1);
    }
  });
  const theme = useTheme();

  // store in a ref to avoid re-rendering this component when the frame number
  // changes
  const frameNumberRef = useRef(null);
  useEventHandler(playerRef.current, "timeupdate", (e) => {
    frameNumberRef.current = e.data.frame_number;
  });

  const selectLabel = onSelectLabel(frameNumberRef);

  return (
    <Container
      style={{ zIndex: 10001 }}
      className={fullscreen ? "fullscreen" : ""}
      ref={ref}
    >
      <div className="player" ref={playerContainerRef}>
        {showJSON ? (
          <JSONView
            currentFrame={frameNumberRef.current}
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
            id={sample._id}
            keep={true}
            overlay={videoLabels}
            colorByLabel={colorByLabel}
            activeLabelsAtom={labelAtoms.activeFields(true)}
            fieldSchema={fieldSchema}
            filterSelector={labelFilters(true)}
            playerRef={playerRef}
            selectedLabels={selectedLabelIds}
            onSelectLabel={selectLabel}
          />
        )}
        {index > 0 ? (
          <div
            className="nav-button left"
            onClick={() => setIndex(index - 1)}
            title="Previous sample (Left arrow)"
          >
            &lt;
          </div>
        ) : null}
        {index < numSamples - 1 ? (
          <div
            className="nav-button right"
            onClick={() => setIndex(index + 1)}
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
        <ModalFooter
          style={{
            overlflowX: "auto",
            width: 296,
            borderTop: "none",
            borderBottom: `2px solid ${theme.border}`,
            position: "relative",
          }}
        >
          <Actions
            modal={true}
            playerRef={playerRef}
            frameNumberRef={frameNumberRef}
          />
        </ModalFooter>
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
      </div>
    </Container>
  );
};

export default React.forwardRef(SampleModal);
