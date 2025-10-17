import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { DETECTION } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import React, { useContext, useEffect } from "react";
import styled from "styled-components";
import Confirmation, { ConfirmationContext } from "../Confirmation";
import AnnotationSchema from "./AnnotationSchema";
import Field from "./Field";
import Footer from "./Footer";
import Header from "./Header";
import Id from "./Id";
import Position from "./Position";
import { currentField, currentOverlay, currentType } from "./state";
import useDelete from "./useDelete";
import useExit from "./useExit";
import useSave from "./useSave";

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

  return (
    <Confirmation onDelete={useDelete()} onExit={useExit()} onSave={useSave()}>
      <LighterEvents />
      <ContentContainer>
        <Header />
        <Content>
          <Id />
          <Field />
          {type === DETECTION && overlay && <Position />}
          {field && <AnnotationSchema />}
        </Content>
        <Footer />
      </ContentContainer>
    </Confirmation>
  );
}
