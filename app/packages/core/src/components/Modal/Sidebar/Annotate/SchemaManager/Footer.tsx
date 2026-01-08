import React, { ReactNode } from "react";
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

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
  leftContent,
}: {
  primaryButton: ButtonConfig;
  secondaryButton?: ButtonConfig;
  leftContent?: ReactNode;
}) => {
  return (
    <Container>
      <LeftSection>{leftContent}</LeftSection>
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
