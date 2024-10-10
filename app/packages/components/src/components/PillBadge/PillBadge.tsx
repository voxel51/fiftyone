import React from "react";
import { Badge, Chip } from "@mui/material";

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
    default: "#777777",
    primary: "#FFB682",
    error: "error",
    warning: "warning",
    info: "info",
    success: "#8BC18D",
  };
  return (
    <span>
      {typeof text === "string" ? (
        <Chip
          icon={<Badge />}
          label={text}
          sx={{ color: COLORS[color || "default"], fontWeight: 500 }}
          variant={variant as "filled" | "outlined" | undefined}
        />
      ) : (
        <Chip />
      )}
    </span>
  );
};

export default PillBadge;
