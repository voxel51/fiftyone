import { Close as CloseIcon } from "@mui/icons-material";
import type { PropsWithChildren } from "react";
import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";

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
  width: 500px;
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

const Modal = ({
  children,
  close,
  title,
}: PropsWithChildren<{ close: () => void; title: string }>) => {
  const element = useMemo(() => {
    const el = document.getElementById("annotation");
    if (!el) {
      throw new Error("no annotation modal element");
    }
    return el;
  }, []);

  useEffect(() => {
    element.style.display = "block";

    return () => {
      element.style.display = "none";
    };
  }, [element]);

  return createPortal(
    <Background onClick={close}>
      <Container onClick={(e) => e.stopPropagation()}>
        <Header>
          {title}
          <Close
            color="secondary"
            style={{ height: "3rem", width: "3rem" }}
            onClick={close}
          />
        </Header>

        {children}
      </Container>
    </Background>,
    element
  );
};

export default Modal;
