import React, { useEffect, useMemo, useRef } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useResetRecoilState,
} from "recoil";
import styled from "styled-components";

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
  useScreenshot,
  useGA,
} from "../utils/hooks";
import Loading from "../components/Loading";

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

function Dataset() {
  const [modal, setModal] = useRecoilState(atoms.modal);
  const http = useRecoilValue(selectors.http);
  const hasDataset = useRecoilValue(selectors.hasDataset);
  const colorMap = useRecoilValue(selectors.colorMap);
  const currentSamples = useRecoilValue(atoms.currentSamples);
  const setExtendedDatasetStats = useSetRecoilState(
    atoms.extendedDatasetStatsRaw
  );
  useGA();
  const setDatasetStats = useSetRecoilState(atoms.datasetStatsRaw);

  useMessageHandler("statistics", ({ stats, view, filters }) => {
    filters && setExtendedDatasetStats({ stats, view, filters });
    !filters && setDatasetStats({ stats, view });
  });

  // reset selected/hidden objects when the modal closes (subject to change) -
  // the socket update is needed here because SampleModal and SelectObjectsMenu
  // are destroyed before they can handle it
  const resetSelectedObjects = useResetRecoilState(atoms.selectedObjects);
  const resetHiddenObjects = useResetRecoilState(atoms.hiddenObjects);
  const handleHideModal = () => {
    setModal({ visible: false, sample: null, metadata: null });
    resetSelectedObjects();
    resetHiddenObjects();
  };

  useScreenshot();

  useEffect(() => {
    document.body.classList.toggle("noscroll", modal.visible);
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
    src = `${http}/filepath/${encodeURI(path)}?id=${id}`;
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
            colorMap={colorMap}
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
            <SamplesContainer />
          </Body>
        ) : (
          <Loading text={"No dataset selected"} />
        )}
      </Container>
    </>
  );
}

export default React.memo(Dataset);
