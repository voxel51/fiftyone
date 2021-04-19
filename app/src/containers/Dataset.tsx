import React, { useEffect, useMemo, useRef } from "react";
import { useRecoilValue, useRecoilCallback } from "recoil";
import styled from "styled-components";

import SamplesContainer from "./SamplesContainer";
import HorizontalNav from "../components/HorizontalNav";
import SampleModal from "../components/SampleModal";
import { ModalWrapper } from "../components/utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useClearModalSamples } from "../recoil/utils";
import {
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
  const modal = useRecoilValue(atoms.modal);
  const hasDataset = useRecoilValue(selectors.hasDataset);
  useGA();
  useSampleUpdate();

  useScreenshot();

  useEffect(() => {
    document.body.classList.toggle("noscroll", modal.visible);
  }, [modal.visible]);

  const clearModalSamples = useClearModalSamples();

  const closeModal = useRecoilCallback(
    ({ reset }) => async () => {
      reset(atoms.modal);
      reset(selectors.selectedLabels);
      reset(atoms.hiddenLabels);
      clearModalSamples();
    },
    []
  );
  const ref = useRef();

  useOutsideClick(ref, closeModal);
  return (
    <>
      {modal.visible ? (
        <ModalWrapper key={0}>
          <SampleModal onClose={closeModal} ref={ref} />
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
