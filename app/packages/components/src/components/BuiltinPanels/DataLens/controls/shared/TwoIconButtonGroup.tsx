import { Box, ButtonProps } from "@mui/material";
import React from "react";
import IconButton from "../../../../IconButton";

interface TwoButtonGroupProps {
  activeButton: "left" | "right";
  children: React.ReactNode;
}

interface TwoButtonChildProps extends ButtonProps {
  isActive?: boolean;
  children: React.ReactNode;
}

function isButtonChild(
  child: React.ReactNode
): child is React.ReactElement<TwoButtonChildProps> {
  return (
    React.isValidElement(child) &&
    (child.type === TwoIconButtonGroup.LeftButton ||
      child.type === TwoIconButtonGroup.RightButton)
  );
}

export const TwoIconButtonGroup = ({
  children,
  activeButton,
}: TwoButtonGroupProps) => {
  return (
    <Box
      sx={{
        borderRadius: "5px",
        bgcolor: "var(--fo-palette-background-level1)",
        display: "flex",
        justifyContent: "space-between",
        py: "1px",
      }}
    >
      {React.Children.map(children, (child) => {
        if (!isButtonChild(child)) return child;
        const isActive =
          child.type === TwoIconButtonGroup.LeftButton
            ? activeButton === "left"
            : activeButton === "right";
        return React.cloneElement(child, { isActive });
      })}
    </Box>
  );
};

const GenericIconButton = ({
  children,
  isActive,
  sx,
  ...props
}: TwoButtonChildProps) => (
  <IconButton
    sx={{
      px: 1,
      color: isActive
        ? "var(--fo-palette-text-primary)"
        : "var(--fo-palette-secondary-main)",
      bgcolor: isActive ? "transparent" : "var(--fo-palette-background-level2)",
      "&:hover": {
        bgcolor: isActive
          ? "transparent"
          : "var(--fo-palette-background-level2)",
        color: "var(--fo-palette-text-primary)",
      },
      ...sx,
    }}
    {...props}
  >
    {children}
  </IconButton>
);

TwoIconButtonGroup.LeftButton = ({
  isActive,
  children,
  ...props
}: TwoButtonChildProps) => (
  <GenericIconButton
    isActive={isActive}
    sx={{
      borderRadius: "5px 0 0 5px",
      margin: "0 0 0 1px",
    }}
    {...props}
  >
    {children}
  </GenericIconButton>
);

TwoIconButtonGroup.RightButton = ({
  isActive,
  children,
  ...props
}: TwoButtonChildProps) => (
  <GenericIconButton
    isActive={isActive}
    sx={{ borderRadius: "0 5px 5px 0", margin: "0 1px 0 0" }}
    {...props}
  >
    {children}
  </GenericIconButton>
);
