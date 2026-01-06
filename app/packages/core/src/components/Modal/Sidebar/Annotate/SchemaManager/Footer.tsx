import React from "react";
import styled from "styled-components";
import { Button, Size, Variant } from "@voxel51/voodo";

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

const RightSection = styled.div`
  display: flex;
  gap: 0.75rem;
`;

interface ButtonConfig {
  onClick: () => void;
  text: string;
  disabled?: boolean;
}

const Footer = ({
  primaryButton,
  secondaryButton,
  leftButton,
}: {
  primaryButton: ButtonConfig;
  secondaryButton?: ButtonConfig;
  leftButton?: ButtonConfig;
}) => {
  return (
    <Container>
      {leftButton ? (
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          onClick={leftButton.onClick}
          disabled={leftButton.disabled}
        >
          {leftButton.text}
        </Button>
      ) : (
        <div />
      )}
      <RightSection>
        {secondaryButton && (
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={secondaryButton.onClick}
            disabled={secondaryButton.disabled}
          >
            {secondaryButton.text}
          </Button>
        )}
        <Button
          size={Size.Sm}
          variant={Variant.Primary}
          onClick={primaryButton.onClick}
          disabled={primaryButton.disabled}
        >
          {primaryButton.text}
        </Button>
      </RightSection>
    </Container>
  );
};

export default Footer;
