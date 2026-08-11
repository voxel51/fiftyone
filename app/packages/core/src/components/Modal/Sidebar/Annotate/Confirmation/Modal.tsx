import type { PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";

const Background = styled.div`
  position: fixed;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  top: 0;
  left: 0;
  z-index: 1000001;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const Container = styled.div`
  width: 500px;
  padding: 2rem;
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: var(--radius-sm);
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
  return createPortal(
    <Background onClick={close}>
      <Container onClick={(e) => e.stopPropagation()}>
        <Header>{title}</Header>

        {children}
      </Container>
    </Background>,
    document.body,
  );
};

export default Modal;
