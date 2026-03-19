import { useAnnotationController } from "@fiftyone/annotation";
import { useTheme } from "@fiftyone/components";
import { ModalMode, useModalMode } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import React from "react";
import styled from "styled-components";
import { isEditing } from "./Annotate/Edit";

const Container = styled.div`
  padding: 0.5rem 1rem;
  width: 100%;
  margin-top: 12px;
`;

const Items = styled.div`
  display: flex;
  position: relative;
  border: 1px solid ${({ theme }) => theme.background.level1};
  border-radius: 3px;
  width: 100%;
  height: 30px;
`;

const Item = styled.div`
  cursor: pointer;
  width: 50%;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const Mode = () => {
  const mode = useModalMode();
  const { enterAnnotationMode, exitAnnotationMode } = useAnnotationController();
  const theme = useTheme();
  const background = { background: theme.background.level1 };
  const text = { color: theme.text.secondary };
  const editing = useAtomValue(isEditing);

  if (editing) {
    return null;
  }

  return (
    <Container>
      <Items>
        <Item
          data-cy={ModalMode.EXPLORE}
          style={mode === ModalMode.EXPLORE ? background : text}
          onClick={() => {
            if (mode === ModalMode.ANNOTATE) {
              exitAnnotationMode();
            }
          }}
        >
          Explore
        </Item>
        <Item
          data-cy={ModalMode.ANNOTATE}
          style={mode === ModalMode.ANNOTATE ? background : text}
          onClick={() => {
            if (mode !== ModalMode.ANNOTATE) {
              enterAnnotationMode();
            }
          }}
        >
          Annotate
        </Item>
      </Items>
    </Container>
  );
};

export default Mode;
