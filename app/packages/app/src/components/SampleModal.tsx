import React, { Suspense, useState, useRef } from "react";
import styled from "styled-components";
import { Close, Fullscreen, FullscreenExit } from "@material-ui/icons";
import {
  useRecoilValue,
  useRecoilState,
  selector,
  useRecoilCallback,
} from "recoil";

import Actions from "./Actions";
import FieldsSidebar from "./FieldsSidebar";
import JSONView from "./JSONView";
import Looker from "./Looker";
import { ModalFooter } from "./utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useKeydownHandler, useTheme } from "../utils/hooks";
import { formatMetadata } from "../utils/labels";
import { showModalJSON } from "../recoil/utils";
import Loading from "./Common/Loading";

const modalSrc = selector<string | null>({
  key: "modalSrc",
  get: ({ get }) => get(selectors.sampleSrc(get(atoms.modal).sampleId)),
});

const modalIndex = selector<number>({
  key: "modalIndex",
  get: ({ get }) => {
    const { sampleId } = get(atoms.modal);
    return get(selectors.sampleIndices)[sampleId];
  },
  set: ({ get, set }, value) => {
    if (typeof value !== "number") {
      value = 0;
    }
    set(atoms.modal, {
      visible: true,
      sampleId: get(selectors.sampleIds)[value],
    });
  },
});

const Container = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: auto 296px;
  width: 90vw;
  height: 80vh;
  max-height: 80vh;
  background-color: ${({ theme }) => theme.background};

  &.fullscreen {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
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

  .looker-element {
    position: relative;
    width: 100%;
    height: 100%;
    max-height: 100%;
    max-width: 100%;
    overflow: hidden;

    .looker-options-panel {
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
    overflow-y: scroll;
    height: 100%;
    border-left: 2px solid ${({ theme }) => theme.border};
    scrollbar-width: none;
    @-moz-document url-prefix() {
      padding-right: 16px;
    }

    .sidebar-content {
      padding-left: 1rem;
      padding-right: 1rem;
      flex-grow: 1;
    }
  }

  .sidebar::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  .sidebar::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
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
  sampleId: string;
};

interface SelectEvent {
  detail: {
    id: string;
    field: string;
    frameNumber?: number;
  };
}

const useOnSelectLabel = () => {
  return useRecoilCallback(
    ({ snapshot, set }) => async ({
      detail: { id, field, frameNumber },
    }: SelectEvent) => {
      const { sampleId } = await snapshot.getPromise(atoms.modal);
      let labels = {
        ...(await snapshot.getPromise(selectors.selectedLabels)),
      };
      if (labels[id]) {
        delete labels[id];
      } else {
        labels[id] = {
          field,
          sample_id: sampleId,
          frame_number: frameNumber,
        };
      }
      set(selectors.selectedLabels, labels);
    },
    []
  );
};

const SampleModal = ({ onClose, sampleId }: Props, ref) => {
  const { filepath, _media_type, metadata, _id } = useRecoilValue(
    atoms.sample(sampleId)
  );
  const sampleSrc = useRecoilValue(modalSrc);
  const [index, setIndex] = useRecoilState(modalIndex);
  const numSamples = useRecoilValue(selectors.currentSamplesSize);
  const playerContainerRef = useRef();
  const showJSON = useRecoilValue(showModalJSON);
  const [enableJSONFilter, setEnableJSONFilter] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const lookerRef = useRef();
  const onSelectLabel = useOnSelectLabel();

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

  return (
    <Container
      style={{ zIndex: 10001 }}
      className={fullscreen ? "fullscreen" : ""}
      ref={ref}
    >
      <div className="looker-element" ref={playerContainerRef}>
        <Suspense fallback={<Loading />}>
          {showJSON ? (
            <JSONView
              filterJSON={enableJSONFilter}
              enableFilter={setEnableJSONFilter}
            />
          ) : (
            <Looker
              key={`modal-${sampleSrc}`} // force re-render when this changes
              sampleId={_id}
              modal={true}
              lookerRef={lookerRef}
              onSelectLabel={onSelectLabel}
            />
          )}
        </Suspense>
      </div>
      <div className="sidebar">
        <ModalFooter
          style={{
            width: "100%",
            borderTop: "none",
            borderBottom: `2px solid ${theme.border}`,
            position: "relative",
          }}
        >
          <Actions modal={true} lookerRef={lookerRef} />
        </ModalFooter>
        <div className="sidebar-content">
          <h2>
            Metadata
            <span className="push-right" />
          </h2>
          <Row name="id" value={_id} />
          <Row name="filepath" value={filepath} />
          <Row name="media type" value={_media_type} />
          {formatMetadata(metadata).map(({ name, value }) => (
            <Row key={"metadata-" + name} name={name} value={value} />
          ))}
          <h2>
            Fields
            <span className="push-right" />
          </h2>
          <Suspense fallback={<Loading />}>
            <FieldsSidebar
              modal={true}
              style={{
                overflowY: "auto",
                overflowX: "hidden",
                height: "auto",
              }}
            />
          </Suspense>
        </div>
        <TopRightNavButton
          onClick={onClose}
          title={"Close"}
          icon={<Close />}
          style={{ position: "absolute", top: 0, right: 0 }}
        />
      </div>
    </Container>
  );
};

export default React.forwardRef(SampleModal);
