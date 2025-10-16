import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { DETECTION } from "@fiftyone/utilities";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useContext, useEffect } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Confirmation, { ConfirmationContext } from "../Confirmation";
import AnnotationSchema from "./AnnotationSchema";
import Field from "./Field";
import Footer from "./Footer";
import Header from "./Header";
import Id from "./Id";
import Position from "./Position";
import {
  currentField,
  currentOverlay,
  currentType,
  deleteValue,
  saveValue,
} from "./state";
import useExit from "./useExit";

const ContentContainer = styled.div`
  margin: 0.25rem 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const Content = styled.div`
  background: ${({ theme }) => theme.neutral.softBg};
  border-radius: 3px;
  width: 100%;
  flex: 1;
  padding: 1rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  row-gap: 0.5rem;
`;

const LighterEvents = () => {
  const { scene } = useLighter();
  const { exit } = useContext(ConfirmationContext);
  useEffect(() => {
    return;
    scene?.on(LIGHTER_EVENTS.OVERLAY_DESELECT, exit);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_DESELECT, exit);
    };
  }, [exit, scene]);

  return null;
};

export default function Edit() {
  const field = useAtomValue(currentField);
  const overlay = useAtomValue(currentOverlay);
  const type = useAtomValue(currentType);
  const exit = useExit();
  const deleteAnnotation = useSetAtom(deleteValue);
  const sampleId = useRecoilValue(fos.currentSampleId);
  const datasetId = fos.useAssertedRecoilValue(fos.datasetId);
  const saveAnnotation = useSetAtom(saveValue);
  return (
    <Confirmation
      deleteAnnotation={useCallback(
        () => deleteAnnotation({ datasetId, sampleId }),
        [datasetId, deleteAnnotation, sampleId]
      )}
      exit={exit}
      saveAnnotation={useCallback(
        () => saveAnnotation({ datasetId, sampleId }),
        [datasetId, sampleId, saveAnnotation]
      )}
    >
      <LighterEvents />
      <ContentContainer>
        <Header />
        <Content>
          <Field />
          <Id />
          {type === DETECTION && overlay && <Position />}
          {field && <AnnotationSchema />}
        </Content>
        <Footer />
      </ContentContainer>
    </Confirmation>
  );
}
