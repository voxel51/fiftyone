import { useTrackEvent } from "@fiftyone/analytics";
import { KnownContexts } from "@fiftyone/commands/src/context/CommandContextManager";
import { useCommandContext } from "@fiftyone/commands/src/hooks/useCommandContext";
import { subscribe } from "@fiftyone/relay";
import { isModalActive, useCurrentDatasetId } from "@fiftyone/state";
import { clearFetchCache } from "@fiftyone/utilities/src/fetch";
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

  const {
    activate: activateCommandContext,
    deactivate: deactivateCommandContext,
  } = useCommandContext(KnownContexts.Modal, true);

  useEffect(() => {
    activateCommandContext();

    return () => {
      deactivateCommandContext();
    };
  }, [isModalOpen, activateCommandContext, deactivateCommandContext]);

  return isModalOpen ? <Modal /> : null;
};

function Dataset() {
  const isCustomizeColorModalActive = useRecoilValue(activeColorEntry);
  const trackEvent = useTrackEvent();

  const datasetId = useCurrentDatasetId();

  // This effect clears the fetch cache whenever the dataset changes to ensure that
  // we don't serve stale data from the cache when switching between datasets.
  useEffect(() => {
    clearFetchCache();
  }, [datasetId]);

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
