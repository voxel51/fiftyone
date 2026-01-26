import { ReactNode } from "react";
import {
  Button,
  Orientation,
  Size,
  Spacing,
  Stack,
  Variant,
} from "@voxel51/voodo";
import { EditFieldFooter } from "./styled";

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
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center" }}
      >
        {leftContent}
      </Stack>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Md}
        style={{ alignItems: "center" }}
      >
        {secondaryButton && (
          <Button
            size={Size.Md}
            variant={Variant.Secondary}
            onClick={secondaryButton.onClick}
            disabled={secondaryButton.disabled}
          >
            {secondaryButton.text}
          </Button>
        )}
        <Button
          size={Size.Md}
          variant={Variant.Primary}
          onClick={primaryButton.onClick}
          disabled={primaryButton.disabled}
        >
          {primaryButton.text}
        </Button>
      </Stack>
    </EditFieldFooter>
  );
};

export default Footer;
