import React, { useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import SamplesContainer from "./SamplesContainer";
import HorizontalNav from "../components/HorizontalNav";
import SampleModal from "../components/SampleModal";
import { ModalWrapper } from "../components/utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import {
  useOutsideClick,
  useSendMessage,
  useScreenshot,
  useSampleUpdate,
  useGA,
  useTheme,
} from "../utils/hooks";
import Loading from "../components/Loading";
import { useClearModal } from "../recoil/utils";

const PLOTS = ["Sample tags", "Label tags", "Labels", "Scalars"];

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
  const theme = useTheme();

  const fullscreen = useRecoilValue(atoms.fullscreen)
    ? { background: theme.backgroundDark }
    : {};
  const hasDataset = useRecoilValue(selectors.hasDataset);
  const clearModal = useClearModal();
  useGA();
  useSampleUpdate();
  useScreenshot();

  useEffect(() => {
    document.body.classList.toggle("noscroll", modal.visible);
  }, [modal.visible]);
  const ref = useRef();

  useOutsideClick(ref, clearModal);
  return (
    <>
      {modal.visible ? (
        <ModalWrapper key={0} style={fullscreen}>
          <SampleModal
            onClose={clearModal}
            ref={ref}
            sampleId={modal.sampleId}
          />
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
