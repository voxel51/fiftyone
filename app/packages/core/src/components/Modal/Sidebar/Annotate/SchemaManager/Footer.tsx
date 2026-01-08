import React, { ReactNode } from "react";
import { Button, Size, Variant } from "@voxel51/voodo";
import { EditFieldFooter, FooterLeft, FooterRight } from "./styled";

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
    <EditFieldFooter>
      <FooterLeft>{leftContent}</FooterLeft>
      <FooterRight>
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
      </FooterRight>
    </EditFieldFooter>
  );
};

export default Footer;
