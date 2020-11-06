import React, { useState, useEffect, useMemo } from "react";
import { Switch, Route, Redirect } from "react-router-dom";
import {
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useResetRecoilState,
} from "recoil";
import { animated, useSpring } from "react-spring";
import styled from "styled-components";

import { PLOTS } from "../Routes";
import SamplesContainer from "./SamplesContainer";
import HorizontalNav from "../components/HorizontalNav";
import SampleModal from "../components/SampleModal";
import { ModalWrapper, Overlay } from "../components/utils";
import routes from "../constants/routes.json";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { VALID_LABEL_TYPES } from "../utils/labels";
import { useSendMessage } from "../utils/hooks";
import logo from "../logo.png";

const Body = styled.div`
  padding: 0 1rem;
  width: 100%;
  height: calc(100% - 131px);
`;

const LogoImg = animated(styled.img`
  width: 4rem;
  height: 4rem;
  margin: auto;
  display: block;
  transform-origin: 50% 50%;
  border-color: ${({ theme }) => theme.backgroundDarkBorder};
`);

const NoDatasetContainer = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
`;

const NoDatasetText = styled.div`
  padding-top: 1rem;
  font-weight: bold;
  text-align: center;
`;

function NoDataset() {
  const [resetOrbit, setResetOrbit] = useState(false);
  const props = useSpring({
    from: { transform: "rotate(0deg)" },
    transform: "rotate(360deg)",
    onRest: () => setResetOrbit((state) => !state),
    reset: resetOrbit,
    config: {
      duration: 3000,
    },
  });
  return (
    <NoDatasetContainer>
      <div style={{ margin: "auto", width: "100%" }}>
        <LogoImg style={props} src={logo} />
        <NoDatasetText>No dataset loaded</NoDatasetText>
      </div>
    </NoDatasetContainer>
  );
}

const applyActiveLabels = (tuples, current, setter) => {
  const newSelection = { ...current };
  for (const [label, type] of tuples) {
    if (newSelection[label] === undefined && VALID_LABEL_TYPES.includes(type)) {
      newSelection[label] = true;
    }
  }
  setter(newSelection);
};

function Dataset(props) {
  const [modal, setModal] = useState({
    visible: false,
    sample: null,
    metadata: null,
    activeLabels: {},
  });
  const port = useRecoilValue(atoms.port);
  const connected = useRecoilValue(atoms.connected);
  const loading = useRecoilValue(atoms.loading);
  const hasDataset = useRecoilValue(selectors.hasDataset);
  const colorMap = useRecoilValue(atoms.colorMap);
  const refreshColorMap = useSetRecoilState(selectors.refreshColorMap);
  const datasetName = useRecoilValue(selectors.datasetName);
  const currentSamples = useRecoilValue(atoms.currentSamples);
  const labelTuples = useRecoilValue(selectors.labelTuples("sample"));
  const frameLabelTuples = useRecoilValue(selectors.labelTuples("frame"));
  const tagNames = useRecoilValue(selectors.tagNames);
  const [activeLabels, setActiveLabels] = useRecoilState(
    atoms.activeLabels("sample")
  );
  const [activeFrameLabels, setActiveFrameLabels] = useRecoilState(
    atoms.activeLabels("frame")
  );
  const activeOther = useRecoilValue(atoms.activeOther("sample"));
  const activeFrameOther = useRecoilValue(atoms.activeOther("frame"));

  // update color map
  useEffect(() => {
    refreshColorMap(colorMap);
  }, [labelTuples, frameLabelTuples, tagNames]);

  // select any new labels by default

  useEffect(() => {
    applyActiveLabels(labelTuples, activeLabels, setActiveLabels);
    applyActiveLabels(
      frameLabelTuples,
      activeFrameLabels,
      setActiveFrameLabels
    );
  }, [datasetName, labelTuples, frameLabelTuples]);

  // reset selected/hidden objects when the modal closes (subject to change) -
  // the socket update is needed here because SampleModal and SelectObjectsMenu
  // are destroyed before they can handle it
  const resetSelectedObjects = useResetRecoilState(atoms.selectedObjects);
  const resetHiddenObjects = useResetRecoilState(atoms.hiddenObjects);
  const socket = useRecoilValue(selectors.socket);
  const handleHideModal = () => {
    setModal({ visible: false, sample: null });
    resetSelectedObjects();
    resetHiddenObjects();
  };

  useEffect(() => {
    document.body.classList.toggle("noscroll", modal.visible);

    setModal({
      ...modal,
      activeLabels: modal.visible
        ? {
            ...activeLabels,
            ...activeOther,
          }
        : {},
      activeFrameLabels: modal.visible
        ? {
            ...activeFrameLabels,
            ...activeFrameOther,
          }
        : {},
    });
  }, [modal.visible]);

  const hideModal = useMemo(() => {
    return (
      modal.visible &&
      !currentSamples.some((i) => i.sample._id === modal.sample._id)
    );
  }, [currentSamples]);

  useEffect(() => {
    hideModal && handleHideModal();
    if (!hideModal && modal.visible) {
      setModal({
        ...modal,
        sample: currentSamples.filter(
          (i) => i.sample._id === modal.sample._id
        )[0].sample,
      });
    }
  }, [hideModal]);

  useSendMessage("set_selected_objects", { selected_objects: [] }, !hideModal);

  let src = null;
  let s = null;
  if (modal.sample) {
    const path = modal.sample.filepath;
    const id = modal.sample._id;
    const host = `http://127.0.0.1:${port}/`;
    src = `${host}?path=${path}&id=${id}`;
    s = modal.sample;
  }
  if (loading) {
    return <Redirect to={routes.LOADING} />;
  }

  if (!connected) {
    return <Redirect to={routes.SETUP} />;
  }

  let modalProps = {};
  if (modal.visible && modal.sample) {
    const currentSampleIndex = currentSamples.findIndex(
      ({ sample }) => sample._id == modal.sample._id
    );
    const previousSample = currentSamples[currentSampleIndex - 1];
    if (previousSample) {
      modalProps.onPrevious = () => setModal({ ...modal, ...previousSample });
    }
    const nextSample = currentSamples[currentSampleIndex + 1];
    if (nextSample) {
      modalProps.onNext = () => setModal({ ...modal, ...nextSample });
    }
  }

  return (
    <>
      {modal.visible ? (
        <ModalWrapper>
          <Overlay onClick={handleHideModal} />
          <SampleModal
            activeLabels={modal.activeLabels}
            activeFrameLabels={modal.activeFrameLabels}
            colorMap={colorMap}
            sample={modal.sample}
            metadata={modal.metadata}
            sampleUrl={src}
            onClose={handleHideModal}
            {...modalProps}
          />
        </ModalWrapper>
      ) : null}
      {hasDataset && <HorizontalNav entries={PLOTS} />}
      {hasDataset ? (
        <Body>
          <SamplesContainer
            {...props.socket}
            setView={(sample, metadata) =>
              setModal({
                ...modal,
                visible: true,
                sample,
                metadata,
              })
            }
            colorMap={colorMap}
          />
        </Body>
      ) : (
        <NoDataset />
      )}
    </>
  );
}

export default React.memo(Dataset);
