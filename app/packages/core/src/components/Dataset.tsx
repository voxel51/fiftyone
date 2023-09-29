import { subscribe } from "@fiftyone/relay";
import { isModalActive } from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import ColorModal from "./ColorModal/ColorModal";
import { activeColorEntry } from "./ColorModal/state";
import Modal from "./Modal";
import SamplesContainer from "./SamplesContainer";

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

function Dataset() {
  const isModalOpen = useRecoilValue(isModalActive);
  const isCustomizeColorModalActive = useRecoilValue(activeColorEntry);

  useEffect(() => {
    return subscribe((_, { reset }) => {
      reset(activeColorEntry);
    });
  }, []);

  return (
    <>
      {isModalOpen && <Modal />}
      {isCustomizeColorModalActive && <ColorModal />}
      <Container>
        <Body key={"body"}>
          <SamplesContainer key={"samples"} />
        </Body>
      </Container>
    </>
  );
}

export default React.memo(Dataset);
