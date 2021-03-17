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
import {
  useMessageHandler,
  useOutsideClick,
  useSendMessage,
  useScreenshot,
  useSampleUpdate,
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

function Dataset() {
  const [modal, setModal] = useRecoilState(atoms.modal);
  const hasDataset = useRecoilValue(selectors.hasDataset);
  const currentSamples = useRecoilValue(selectors.currentSamples);
  useGA();
  useSampleUpdate();

  // reset selected/hidden objects when the modal closes (subject to change) -
  // the socket update is needed here because SampleModal and SelectObjectsMenu
  // are destroyed before they can handle it
  const resetSelectedObjects = useResetRecoilState(selectors.selectedLabels);
  const resetHiddenObjects = useResetRecoilState(atoms.hiddenLabels);
  const handleHideModal = () => {
    setModal({ visible: false, sample_id: null });
    resetSelectedObjects();
    resetHiddenObjects();
  };

  useScreenshot();

  useEffect(() => {
    document.body.classList.toggle("noscroll", modal.visible);
  }, [modal.visible]);

  const hideModal = useMemo(() => {
    return (
      modal.visible && !currentSamples.some((id) => id === modal.sample_id)
    );
  }, [currentSamples]);

  useEffect(() => {
    hideModal && handleHideModal();
    if (!hideModal && modal.visible) {
      setModal({
        ...modal,
        sample_id: currentSamples.filter((id) => id === modal.sample_id)[0],
      });
    }
  }, [hideModal]);

  useSendMessage("set_selected_labels", { selected_labels: [] }, !hideModal);
  const ref = useRef();

  useOutsideClick(ref, handleHideModal);
  return (
    <>
      {modal.visible ? (
        <ModalWrapper key={0}>
          <SampleModal onClose={handleHideModal} ref={ref} />
        </ModalWrapper>
      ) : null}
      <Container key={1}>
        {hasDataset && <HorizontalNav entries={PLOTS} key={"nav"} />}
        {hasDataset ? (
          <Body key={"body"}>
            <SamplesContainer key={"samples"} />
          </Body>
        ) : (
          <Loading text={"No dataset selected"} key={"loading"} />
        )}
      </Container>
    </>
  );
}

export default React.memo(Dataset);
