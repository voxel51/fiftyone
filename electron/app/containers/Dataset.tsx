import React, { useState, useEffect } from "react";
import { Switch, Route, Redirect } from "react-router-dom";
import {
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useResetRecoilState,
} from "recoil";
import { Message, Segment } from "semantic-ui-react";
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

const Body = styled.div`
  padding: 0 1rem;
  width: 100%;
  height: calc(100% - 131px);
`;

function NoDataset() {
  return (
    <Segment>
      <Message>No dataset loaded</Message>
    </Segment>
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
    socket.emit("set_selected_objects", []);
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

  useEffect(() => {
    if (
      modal.visible &&
      !currentSamples.some((i) => i.sample._id === modal.sample._id)
    ) {
      handleHideModal();
    } else if (modal.visible) {
      setModal({
        ...modal,
        sample: currentSamples.filter(
          (i) => i.sample._id === modal.sample._id
        )[0].sample,
      });
    }
  }, [currentSamples]);

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
      <HorizontalNav entries={PLOTS} />
      <Body>
        <Switch>
          {hasDataset ? (
            <>
              <Route path={routes.DATASET}>
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
              </Route>
            </>
          ) : (
            <NoDataset />
          )}
        </Switch>
      </Body>
    </>
  );
}

export default React.memo(Dataset);
