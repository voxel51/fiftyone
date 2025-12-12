import { West as BackIcon, Close as CloseIcon } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { ItemLeft } from "../Components";
import { activeSchemaTab, showModal } from "../state";
import EditAnnotationFieldSchema from "./EditAnnotationFieldSchema";
import FieldsTabs from "./FieldsTabs";
import GUIView from "./GUIView";
import JSONView from "./JSONView";
import { currentField } from "./state";

const Back = styled(BackIcon)`
  cursor: pointer;
  height: 3rem !important;
  padding: 0.5rem;
  width: 3rem !important;

  &:hover {
    background: ${({ theme }) => theme.background.level1};
    border-radius: 1.5rem;
    color: ${({ theme }) => theme.text.primary};
  }
`;

const Close = styled(CloseIcon)`
  cursor: pointer;
  height: 3rem !important;
  padding: 0.5rem;
  width: 3rem !important;

  &:hover {
    background: ${({ theme }) => theme.background.level1};
    border-radius: 1.5rem;
    color: ${({ theme }) => theme.text.primary};
  }
`;

const Background = styled.div`
  position: absolute;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  top: 0;
  left: 0;
  z-index: 1001;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const Container = styled.div`
  width: 800px;
  max-width: 90%;
  height: 90%;
  padding: 2rem;
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  position: relative;
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
`;

const Heading = () => {
  const [field, setField] = useAtom(currentField);

  if (!field) {
    return <Typography variant="h5">Schema manager</Typography>;
  }

  return (
    <ItemLeft>
      <Back color="secondary" onClick={() => setField(null)} />
      <Typography variant="h5">Edit field schema</Typography>
    </ItemLeft>
  );
};

const Subheading = () => {
  const field = useAtomValue(currentField);

  if (field) {
    return null;
  }

  return (
    <>
      <Typography color="secondary" padding="1rem 0">
        Import schemas to get started with Annotation
      </Typography>
      <Header style={{ margin: "1rem 0" }}>
        <FieldsTabs />
      </Header>
    </>
  );
};

const Page = () => {
  const field = useAtomValue(currentField);
  const tab = useAtomValue(activeSchemaTab);

  if (field) {
    return <EditAnnotationFieldSchema path={field} />;
  }

  if (tab === "gui") {
    return <GUIView />;
  }

  return <JSONView />;
};

const Modal = () => {
  const element = useMemo(() => {
    const el = document.getElementById("annotation");
    if (!el) {
      throw new Error("no annotation modal element");
    }
    return el;
  }, []);
  const show = useSetAtom(showModal);

  useEffect(() => {
    element.style.display = "block";

    return () => {
      element.style.display = "none";
    };
  }, [element]);

  return createPortal(
    <Background onClick={() => show(false)}>
      <Container onClick={(e) => e.stopPropagation()}>
        <Header>
          <Heading />
          <Close
            color="secondary"
            style={{ height: "3rem", width: "3rem" }}
            onClick={() => show(false)}
          />
        </Header>

        <Subheading />

        <Page />
      </Container>
    </Background>,
    element
  );
};

export default Modal;
