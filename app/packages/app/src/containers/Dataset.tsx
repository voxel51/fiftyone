import React, { useEffect, useRef } from "react";
import { useRecoilCallback, useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";

import SamplesContainer from "./SamplesContainer";
import HorizontalNav from "../components/HorizontalNav";
import SampleModal from "../components/SampleModal";
import { ModalWrapper } from "../components/utils";
import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import {
  useOutsideClick,
  useScreenshot,
  useGA,
  useTheme,
} from "../utils/hooks";
import Loading from "../components/Loading";
import { useClearModal } from "../recoil/utils";
import { activeFields } from "../components/Filters/utils";

const PLOTS = ["Sample tags", "Label tags", "Labels", "Other"];

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

const useResetPaths = () => {
  const dataset = useRecoilValue(selectors.datasetName);
  const resetPaths = useResetRecoilState(activeFields);
  useEffect(() => {
    resetPaths();
  }, [dataset]);
};

function Dataset() {
  const ref = useRef();
  const isModalActive = useRecoilValue(selectors.isModalActive);
  const theme = useTheme();

  const fullscreen = useRecoilValue(atoms.fullscreen)
    ? { background: theme.backgroundDark }
    : {};
  const hasDataset = useRecoilValue(selectors.hasDataset);

  useGA();
  useScreenshot();
  useResetPaths();

  const clearModal = useClearModal();
  useOutsideClick(ref, clearModal);

  useEffect(() => {
    document.body.classList.toggle("noscroll", isModalActive);
  }, [isModalActive]);

  return (
    <>
      {isModalActive ? (
        <ModalWrapper key={0} style={fullscreen}>
          <SampleModal onClose={clearModal} ref={ref} />
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
