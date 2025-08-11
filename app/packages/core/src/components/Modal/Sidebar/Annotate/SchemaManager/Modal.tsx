import { Add, Close as CloseIcon, West } from "@mui/icons-material";
import { Typography } from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { RoundButton } from "../Actions";
import {
  activeSchemaTab,
  editingAnnotationFieldSchema,
  showSchemaManager,
} from "../state";
import ActiveSchema from "./ActiveSchema";
import { ItemLeft } from "./Components";
import EditAnnotationFieldSchema from "./EditAnnotationFieldSchema";
import FieldsTabs from "./FieldsTabs";
import OtherFields from "./OtherFields";

const Close = styled(CloseIcon)`
  height: 3rem;
  padding: 0.5rem;
  width: 3rem;

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

const NewField = styled(RoundButton)`
  &:hover path {
    fill: ${({ theme }) => theme.text.primary};
  }
`;

const Modal = () => {
  const element = useMemo(() => {
    const el = document.getElementById("schemaManager");
    if (!el) {
      throw new Error("no schemaManager modal element");
    }
    return el;
  }, []);
  const toggle = useSetAtom(showSchemaManager);
  const tab = useAtomValue(activeSchemaTab);
  const [field, setField] = useAtom(editingAnnotationFieldSchema);

  return createPortal(
    <Background onClick={() => toggle(false)}>
      <Container onClick={(e) => e.stopPropagation()}>
        <Header>
          {field ? (
            <ItemLeft>
              <West
                color="secondary"
                style={{ cursor: "pointer", height: "2rem", width: "2rem" }}
                onClick={() => setField(null)}
              />
              <Typography variant="h5">Edit schema</Typography>
            </ItemLeft>
          ) : (
            <Typography variant="h5">Schema manager</Typography>
          )}

          <Close
            color="secondary"
            style={{ cursor: "pointer", height: "3rem", width: "3rem" }}
            onClick={() => toggle(false)}
          />
        </Header>

        {!field && (
          <>
            <Typography color="secondary" padding="1rem 0">
              Import schema to get started with Annotation
            </Typography>
            <Header style={{ margin: "1rem 0" }}>
              <FieldsTabs />
              {tab === "active" && (
                <NewField>
                  <Add />
                  New field
                </NewField>
              )}
            </Header>
          </>
        )}

        {field ? (
          <EditAnnotationFieldSchema />
        ) : tab === "active" ? (
          <ActiveSchema />
        ) : (
          <OtherFields />
        )}
      </Container>
    </Background>,
    element
  );
};

export default Modal;
