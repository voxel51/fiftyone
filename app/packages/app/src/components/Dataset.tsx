import React, { useContext, useEffect } from "react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";

import SamplesContainer from "./SamplesContainer";
import HorizontalNav from "../components/HorizontalNav";
import SampleModal from "./SampleModal";
import * as selectors from "../recoil/selectors";
import Loading from "../components/Loading";
import * as schemaAtoms from "../recoil/schema";
import { modal } from "../recoil/atoms";
import { RouterContext } from "@fiftyone/components";

const PLOTS = ["Sample tags", "Label tags", "Labels", "Other fields"];

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const Body = styled.div`
  width: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
`;

const useResetPaths = () => {
  const resetPaths = useResetRecoilState(
    schemaAtoms.activeFields({ modal: false })
  );
  const router = useContext(RouterContext);
  router.subscribe(() => {
    resetPaths();
  });
};

function Dataset() {
  const isModalActive = Boolean(useRecoilValue(modal));

  useResetPaths();

  useEffect(() => {
    document.body.classList.toggle("noscroll", isModalActive);
    document
      .getElementById("modal")
      ?.classList.toggle("modalon", isModalActive);
  }, [isModalActive]);

  return (
    <>
      {isModalActive && <SampleModal />}
      <Container>
        <HorizontalNav entries={PLOTS} key={"nav"} />
        <Body key={"body"}>
          <SamplesContainer key={"samples"} />
        </Body>
      </Container>
    </>
  );
}

export default React.memo(Dataset);
