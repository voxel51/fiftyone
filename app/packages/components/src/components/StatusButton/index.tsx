import React, { useState } from "react";
import {
  Button,
  ButtonGroup,
  Typography,
  Box,
  Tooltip,
  ButtonProps,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import CircleIcon from "@mui/icons-material/FiberManualRecord";
import { useTheme } from "../";

const ButtonStylesOverrides: ButtonProps["sx"] = {
  color: (theme) => theme.palette.text.secondary,
  // background: (theme) => theme.palette.background.default,
  border: "1px solid",
  borderColor: (theme) => `${theme.palette.divider} !important`,
  textTransform: "none",
  fontSize: "1rem",
};

export default function StatusButton({
  label = "Disabled",
  disabled = false,
  disabledReason = "Feature is disabled",
  onClick,
}) {
  const theme = useTheme();

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    onClick();
  };

  const tooltipTitle = disabled ? disabledReason : null;

  return (
    <Tooltip title={tooltipTitle}>
      <ButtonGroup variant="outlined" sx={{ ...ButtonStylesOverrides }}>
        {/* Non-interactive Label with Icon */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          padding="8px 16px"
          sx={{
            borderRight: `1px solid ${theme.divider}`,
          }}
        >
          <CircleIcon
            sx={{ width: "8px", color: theme.text.secondary, mr: 1 }}
          />
          <Typography
            variant="body1"
            sx={{
              color: theme.text.secondary,
              textTransform: "none",
            }}
          >
            {label}
          </Typography>
        </Box>

        {/* Settings Button */}
        <Button
          disableRipple
          onClick={handleClick}
          sx={{ minWidth: 32, border: "none" }}
        >
          <SettingsIcon sx={{ width: "20px", color: theme.secondary.main }} />
        </Button>
      </ButtonGroup>
    </Tooltip>
  );
}
