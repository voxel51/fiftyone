import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";

import { Check, Close, Fullscreen, FullscreenExit } from "@material-ui/icons";
import { useRecoilState, useRecoilValue } from "recoil";

import FieldsSidebar from "./FieldsSidebar";
import JSONView from "./JSONView";
import Player51 from "./Player51";
import SelectObjectsMenu from "./SelectObjectsMenu";
import { Button, ModalFooter } from "./utils";
import * as selectors from "../recoil/selectors";
import * as atoms from "../recoil/atoms";
import { SampleContext } from "../utils/context";

import {
  useEventHandler,
  useKeydownHandler,
  useResizeHandler,
  useVideoData,
} from "../utils/hooks";
import { formatMetadata, stringify } from "../utils/labels";
import { useToggleSelectionObject } from "../utils/selection";

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

    ${ModalFooter} {
      align-items: flex-start;
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

const Row = ({ name, renderedName, value, children, ...rest }) => (
  <div className="row" {...rest}>
    <label>{renderedName || name}&nbsp;</label>
    <div>
      <span title={value}>{value}</span>
    </div>
    {children}
  </div>
);

const SampleModal = ({
  sample,
  sampleUrl,
  metadata,
  colorMap = {},
  onClose,
  port,
  ...rest
}: Props) => {
  const playerContainerRef = useRef();
  const [playerStyle, setPlayerStyle] = useState({
    height: "100%",
    width: "100%",
  });
  const [showJSON, setShowJSON] = useState(false);
  const [enableJSONFilter, setEnableJSONFilter] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeLabels, setActiveLabels] = useRecoilState(
    atoms.modalActiveLabels("sample")
  );
  const [activeFrameLabels, setActiveFrameLabels] = useRecoilState(
    atoms.modalActiveLabels("frame")
  );
  const mediaType = useRecoilValue(selectors.mediaType);
  const filter = useRecoilValue(selectors.sampleModalFilter);
  const activeTags = useRecoilValue(atoms.modalActiveTags);
  const tagNames = useRecoilValue(selectors.tagNames);
  const fieldSchema = useRecoilValue(selectors.fieldSchema("sample"));
  const labelNameGroups = useRecoilValue(selectors.labelNameGroups("sample"));
  const frameLabelNameGroups = useRecoilValue(
    selectors.labelNameGroups("frame")
  );
  const colorByLabel = useRecoilValue(atoms.modalColorByLabel);
  const socket = useRecoilValue(selectors.socket);
  const viewCounter = useRecoilValue(atoms.viewCounter);
  const [requested, requestLabels] = useVideoData(socket, sample);
  const frameData = useRecoilValue(atoms.sampleFrameData(sample._id));
  const videoLabels = useRecoilValue(atoms.sampleVideoLabels(sample._id));
  useEffect(() => {
    mediaType === "video" && requested !== viewCounter && requestLabels();
  }, [requested]);

  useEffect(() => {
    setActiveLabels(rest.activeLabels);
  }, [rest.activeLabels]);
  useEffect(() => {
    setActiveFrameLabels(rest.activeFrameLabels);
  }, [rest.activeFrameLabels]);

  const toggleSelectedObject = useToggleSelectionObject(atoms.selectedObjects);
  const selectedObjectIDs = Object.keys(useRecoilValue(atoms.selectedObjects));

  // save overlay options when navigating - these are restored by passing them
  // in defaultOverlayOptions when the new player is created
  const playerRef = useRef();
  const [savedOverlayOptions, setSavedOverlayOptions] = useState({});
  const wrapNavigationFunc = (callback) => {
    if (callback) {
      return () => {
        if (playerRef.current) {
          setSavedOverlayOptions(playerRef.current.getOverlayOptions());
        }
        callback();
      };
    }
  };
  const onPrevious = wrapNavigationFunc(rest.onPrevious);
  const onNext = wrapNavigationFunc(rest.onNext);

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

  const getDisplayOptions = (
    values,
    countOrExists,
    selected,
    hideCheckbox = false,
    filteredCountOrExists
  ) => {
    return [...values].sort().map(({ name, type }) => ({
      hideCheckbox,
      name,
      type,
      icon: ["boolean", "undefined"].includes(typeof countOrExists[name]) ? (
        countOrExists[name] ? (
          <Check style={{ color: colorMap[name] }} />
        ) : (
          <Close style={{ color: colorMap[name] }} />
        )
      ) : undefined,
      totalCount: countOrExists[name],
      filteredCount: filteredCountOrExists
        ? filteredCountOrExists[name]
        : undefined,
      selected: Boolean(selected[name]),
    }));
  };

  const handleSetDisplayOption = (setSelected) => (entry) => {
    setSelected((selected) => ({
      ...selected,
      [entry.name]: entry.selected,
    }));
  };

  const tagSampleExists = tagNames.reduce(
    (acc, tag) => ({
      ...acc,
      [tag]: sample.tags.includes(tag),
    }),
    {}
  );

  const labelSampleValuesReducer = (s, groups, filterData = false) => {
    const isVideo = s._media_type === "video";
    return groups.labels.reduce((obj, { name, type }) => {
      let value = 0;
      const resolver = (frame, prefix = "") => {
        const path = prefix + name;
        if (!frame[path]) return 0;
        return ["Detections", "Classifications", "Polylines"].includes(type)
          ? frame[path][type.toLowerCase()].length
          : type === "Keypoints"
          ? frame[path].keypoints.reduce(
              (acc, cur) => acc + cur.points.length,
              0
            )
          : type === "Keypoint"
          ? frame[path].points.length
          : 1;
      };

      if (!(name in s) && isVideo && frameData) {
        for (const frame of frameData) {
          const pathFrame = Object.keys(frame).reduce(
            (acc, cur) => ({
              ...acc,
              ["frames." + cur]: frame[cur],
            }),
            {}
          );
          if (frame[name])
            value += resolver(
              filterData ? filter(pathFrame) : pathFrame,
              "frames."
            );
        }
      } else if (!(name in s) && isVideo) {
        value = "-";
      } else {
        value += resolver(s);
      }
      return {
        ...obj,
        [name]: value,
      };
    }, {});
  };

  const labelSampleValues = labelSampleValuesReducer(sample, labelNameGroups);
  const filteredLabelSampleValues = labelSampleValuesReducer(
    filter(sample),
    labelNameGroups,
    true
  );
  const frameLabelSampleValues = labelSampleValuesReducer(
    sample,
    frameLabelNameGroups
  );
  const filteredFrameLabelSampleValues = labelSampleValuesReducer(
    filter(sample),
    frameLabelNameGroups,
    true
  );

  const scalarSampleValues = labelNameGroups.scalars.reduce(
    (obj, { name }) => ({
      ...obj,
      [name]:
        sample[name] !== undefined && sample[name] !== null
          ? stringify(sample[name])
          : undefined,
    }),
    {}
  );

  const otherSampleValues = labelNameGroups.unsupported.reduce((obj, label) => {
    return {
      ...obj,
      [label]: label in sample,
    };
  }, {});

  return (
    <SampleContext.Provider value={sample}>
      <Container className={fullscreen ? "fullscreen" : ""}>
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
              metadata={metadata}
              colorMap={colorMap}
              colorByLabel={colorByLabel}
              activeLabels={activeLabels}
              activeFrameLabels={activeFrameLabels}
              fieldSchema={fieldSchema}
              filterSelector={selectors.modalLabelFilters}
              playerRef={playerRef}
              defaultOverlayOptions={savedOverlayOptions}
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
              colorMap={colorMap}
              tags={getDisplayOptions(
                tagNames.map((t) => ({ name: t })),
                tagSampleExists,
                activeTags,
                true
              )}
              labels={getDisplayOptions(
                labelNameGroups.labels,
                labelSampleValues,
                activeLabels,
                false,
                filteredLabelSampleValues
              )}
              frameLabels={getDisplayOptions(
                frameLabelNameGroups.labels,
                frameLabelSampleValues,
                activeFrameLabels,
                false,
                filteredFrameLabelSampleValues
              )}
              onSelectLabel={handleSetDisplayOption(setActiveLabels)}
              onSelectFrameLabel={handleSetDisplayOption(setActiveFrameLabels)}
              scalars={getDisplayOptions(
                labelNameGroups.scalars,
                scalarSampleValues,
                activeLabels,
                true
              )}
              onSelectScalar={handleSetDisplayOption(setActiveLabels)}
              unsupported={getDisplayOptions(
                labelNameGroups.unsupported,
                otherSampleValues,
                activeLabels
              )}
              style={{
                overflowY: "auto",
                overflowX: "hidden",
                height: "auto",
              }}
              colorByLabelAtom={atoms.modalColorByLabel}
              modal={true}
            />
            <TopRightNavButton
              onClick={onClose}
              title={"Close"}
              icon={<Close />}
              style={{ position: "absolute", top: 0, right: 0 }}
            />
          </div>
          <ModalFooter>
            <Button onClick={() => setShowJSON(!showJSON)}>
              {showJSON ? "Hide" : "Show"} JSON
            </Button>
          </ModalFooter>
        </div>
      </Container>
    </SampleContext.Provider>
  );
};

export default SampleModal;
