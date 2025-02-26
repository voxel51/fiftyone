import { useTrackEvent } from "@fiftyone/analytics";
import { subscribe } from "@fiftyone/relay";
import { isModalActive } from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import ColorModal from "./ColorModal/ColorModal";
import { activeColorEntry } from "./ColorModal/state";
import EventTracker from "./EventTracker";
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

const ModalWrapper = () => {
  const isModalOpen = useRecoilValue(isModalActive);
  return isModalOpen ? <Modal /> : null;
};

function Dataset() {
  const isCustomizeColorModalActive = useRecoilValue(activeColorEntry);
  const trackEvent = useTrackEvent();

  useEffect(() => {
    trackEvent("open_dataset");
    return subscribe((_, { reset }) => {
      reset(activeColorEntry);
    });
  }, []);

  return (
    <>
      <ModalWrapper key={"modal"} />
      {isCustomizeColorModalActive && <ColorModal key={"color"} />}
      <Container key={"dataset"}>
        <Body key={"body"}>
          <SamplesContainer key={"samples"} />
        </Body>
        <EventTracker />
      </Container>
    </>
  );
}

export default React.memo(Dataset);
