import React from "react";
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
import _ from "lodash";

const ButtonStylesOverrides: ButtonProps["sx"] = {
  color: (theme) => theme.palette.text.secondary,
  border: "1px solid",
  borderColor: (theme) => `${theme.palette.divider} !important`,
  textTransform: "none",
  fontSize: "1rem",
};

type Severity = "info" | "success" | "warning" | "error";

const SEVERITY_COLORS = {
  info: "info.main",
  success: "success.main",
  warning: "warning.main",
  error: "error.main",
  disabled: "text.disabled",
  enabled: "custom.primaryMedium",
};

export type StatusButtonProps = {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
  severity: Severity;
  title?: string;
};

export default function StatusButton({
  label = "Disabled",
  disabled = false,
  title,
  onClick,
  severity,
}: StatusButtonProps) {
  const theme = useTheme();
  const severityPath = SEVERITY_COLORS[severity];
  const severityColor = _.get(theme, severityPath);

  const handleClick = () => {
    onClick();
  };

  return (
    <Tooltip title={title}>
      <ButtonGroup variant="outlined" sx={{ ...ButtonStylesOverrides }}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          padding="0 8px 0 16px"
          sx={{
            borderRight: `1px solid ${theme.divider}`,
          }}
        >
          <CircleIcon
            sx={{ width: "12px", height: "12px", color: severityColor, mr: 1 }}
          />
          <Typography
            variant="body1"
            sx={{
              color: severityColor,
              textTransform: "none",
              mr: "8px",
            }}
          >
            {label}
          </Typography>
        </Box>
        <Button
          disableRipple
          disabled={disabled}
          onClick={handleClick}
          sx={{
            minWidth: 32,
            opacity: disabled ? 0.5 : 1,
            outline: "none",
            border: "none !important", // overrides disabled border
            "&:hover": {
              border: "none",
              outline: "none",
              background: theme.action.hover,
            },
          }}
        >
          <SettingsIcon sx={{ width: "20px", color: theme.secondary.main }} />
        </Button>
      </ButtonGroup>
    </Tooltip>
  );
}
