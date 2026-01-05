import { MuiButton } from "@fiftyone/components";
import React from "react";
import styled from "styled-components";

const Container = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  border-top: 1px solid ${({ theme }) => theme.divider};
  align-items: center;
  position: absolute;
  bottom: 0;
  padding: 0 2rem;
  height: 64px;
  left: 0;
  background: ${({ theme }) => theme.background.level2};
`;

interface Button {
  onClick: () => void;
  text: string;
  disabled?: boolean;
}

const Footer = ({
  primaryButton,
  secondaryButton,
}: {
  primaryButton: Button;
  secondaryButton?: Button;
}) => {
  return (
    <Container>
      {secondaryButton ? (
        <MuiButton
          variant="outlined"
          color="secondary"
          onClick={secondaryButton.onClick}
          disabled={secondaryButton.disabled}
        >
          {secondaryButton.text}
        </MuiButton>
      ) : (
        <div />
      )}
      <MuiButton
        variant="contained"
        color="primary"
        onClick={primaryButton.onClick}
        disabled={primaryButton.disabled}
      >
        {primaryButton.text}
      </MuiButton>
    </Container>
  );
};

export default Footer;
