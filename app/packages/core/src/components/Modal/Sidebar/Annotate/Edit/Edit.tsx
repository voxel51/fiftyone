import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { useClearModal } from "@fiftyone/state";
import { DETECTION } from "@fiftyone/utilities";
import { getDefaultStore, useAtomValue } from "jotai";
import React, { useContext, useEffect } from "react";
import styled from "styled-components";
import Confirmation, { ConfirmationContext } from "../Confirmation";
import useConfirmExit from "../Confirmation/useConfirmExit";
import AnnotationSchema from "./AnnotationSchema";
import Field from "./Field";
import Footer from "./Footer";
import Header from "./Header";
import Id from "./Id";
import Position from "./Position";
import { currentField, currentOverlay, currentType, hasChanges } from "./state";
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
  const overlay = useAtomValue(currentOverlay);
  const { onExit } = useContext(ConfirmationContext);
  useEffect(() => {
    const handler = () => {
      if (getDefaultStore().get(hasChanges)) {
        overlay?.setSelected(true);
        onExit();
      }
    };
    scene?.on(LIGHTER_EVENTS.OVERLAY_DESELECT, handler);

    return () => {
      scene?.off(LIGHTER_EVENTS.OVERLAY_DESELECT, handler);
    };
  }, [onExit, overlay, scene]);

  return null;
};

export default function Edit() {
  const field = useAtomValue(currentField);
  const overlay = useAtomValue(currentOverlay);
  const type = useAtomValue(currentType);

  const clear = useClearModal();
  const exit = useExit();

  const { confirmExit } = useConfirmExit(() => {
    clear();
    exit();
  }, useSave());

  useEffect(() => {
    const handler = (event: Event) => {
      if (event.target === el) {
        event.stopImmediatePropagation();
        confirmExit(clear);
      }
    };

    const el = document.getElementById("modal")?.children[0];

    el?.addEventListener("click", handler, true);

    return () => {
      el?.removeEventListener("click", handler);
    };
  }, [confirmExit, clear]);

  return (
    <Confirmation>
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
