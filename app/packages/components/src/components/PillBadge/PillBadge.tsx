import React from "react";
import CircleIcon from "@mui/icons-material/Circle";
import { Chip } from "@mui/material";

const PillBadge = ({
  text,
  color,
  variant = "filled",
}: {
  text: string | string[];
  color?: string;
  variant?: "filled" | "outlined";
}) => {
  const COLORS: { [key: string]: string } = {
    default: "#999999",
    primary: "#FFB682",
    error: "error",
    warning: "warning",
    info: "info",
    success: "#8BC18D",
  };

  const chipStyle: { [key: string]: string | number } = {
    color: COLORS[color || "default"],
    fontWeight: 500,
    paddingLeft: 1,
  };

  return (
    <span>
      {typeof text === "string" ? (
        <Chip
          icon={<CircleIcon color={"inherit"} sx={{ fontSize: 10 }} />}
          label={text}
          sx={{
            ...chipStyle,
            "& .MuiChip-label": {
              marginBottom: "2px",
            },
          }}
          variant={variant as "filled" | "outlined" | undefined}
        />
      ) : (
        <Chip />
      )}
    </span>
  );
};

export default PillBadge;
