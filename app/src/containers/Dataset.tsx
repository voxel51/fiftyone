import React, { useEffect, useMemo, useRef } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useResetRecoilState,
} from "recoil";
import styled from "styled-components";
import html2canvas from "html2canvas";

import SamplesContainer from "./SamplesContainer";
import HorizontalNav from "../components/HorizontalNav";
import SampleModal from "../components/SampleModal";
import { ModalWrapper } from "../components/utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { VALID_LABEL_TYPES } from "../utils/labels";
import {
  useMessageHandler,
  useOutsideClick,
  useSendMessage,
} from "../utils/hooks";
import Loading from "../components/Loading";
import { packageMessage } from "../utils/socket";

const PLOTS = ["labels", "scalars", "tags"];

const Container = styled.div`
  height: calc(100% - 74px);
  display: flex;
  flex-direction: column;
`;

const Body = styled.div`
  padding: 0 1rem;
  width: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

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
  const [modal, setModal] = useRecoilState(atoms.modal);
  const http = useRecoilValue(selectors.http);
  const hasDataset = useRecoilValue(selectors.hasDataset);
  const colorMap = useRecoilValue(atoms.colorMap);
  const refreshColorMap = useSetRecoilState(selectors.refreshColorMap);
  const datasetName = useRecoilValue(selectors.datasetName);
  const currentSamples = useRecoilValue(atoms.currentSamples);
  const labelTuples = useRecoilValue(selectors.labelTuples("sample"));
  const frameLabelTuples = useRecoilValue(selectors.labelTuples("frame"));
  const socket = useRecoilValue(selectors.socket);
  const tagNames = useRecoilValue(selectors.tagNames);
  const setExtendedDatasetStats = useSetRecoilState(
    atoms.extendedDatasetStatsRaw
  );
  const setDatasetStats = useSetRecoilState(atoms.datasetStatsRaw);
  const [activeLabels, setActiveLabels] = useRecoilState(
    atoms.activeLabels("sample")
  );
  const [activeFrameLabels, setActiveFrameLabels] = useRecoilState(
    atoms.activeLabels("frame")
  );
  const activeOther = useRecoilValue(atoms.activeOther("sample"));
  const activeFrameOther = useRecoilValue(atoms.activeOther("frame"));
  const handleId = useRecoilValue(selectors.handleId);

  useMessageHandler("statistics", ({ stats, view, filters }) => {
    filters && setExtendedDatasetStats({ stats, view, filters });
    !filters && setDatasetStats({ stats, view });
  });

  useMessageHandler("deactivate", ({ html }) => {
    const svgElements = document.body.querySelectorAll("svg");
    svgElements.forEach((item) => {
      item.setAttribute("width", item.getBoundingClientRect().width);
      item.setAttribute("height", item.getBoundingClientRect().height);
    });
    html2canvas(document.body, {
      useCORS: true,
    }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      if (html) {
        window.document.body.innerHTML = html
          .replace("img-data-src", imgData)
          .replace("handle-id", handleId);
      } else {
        socket.send(packageMessage("capture", { src: imgData }));
      }
    });
  });

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
    src = `${http}/filepath${path}?id=${id}`;
    s = modal.sample;
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
  const ref = useRef();

  useOutsideClick(ref, handleHideModal);

  return (
    <>
      {modal.visible ? (
        <ModalWrapper>
          <SampleModal
            activeLabels={modal.activeLabels}
            activeFrameLabels={modal.activeFrameLabels}
            colorMap={colorMap}
            sample={modal.sample}
            metadata={modal.metadata}
            sampleUrl={src}
            onClose={handleHideModal}
            {...modalProps}
            ref={ref}
          />
        </ModalWrapper>
      ) : null}
      <Container>
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
          <Loading text={"No dataset selected"} />
        )}
      </Container>
    </>
  );
}

export default React.memo(Dataset);
