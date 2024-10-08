import React from "react";
import { Badge, Chip } from "@mui/material";

const PillBadge = ({
  text,
  color,
  variant,
}: {
  text: string;
  color?: string;
  variant?: string;
}) => {
  const COLORS: { [key: string]: string } = {
    default: "#777777",
    primary: "#FFB682",
    error: "error",
    warning: "warning",
    info: "info",
    success: "#8BC18D",
  };
  return <Chip label={text} />;
};

export default PillBadge;
