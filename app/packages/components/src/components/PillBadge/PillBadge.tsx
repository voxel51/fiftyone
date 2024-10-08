import React from "react";
import { Badge, Chip } from "@mui/material";

const PillBadge = ({ text, color }: { text: string; color?: string }) => {
  const COLORS: { [key: string]: string } = {
    default: "#777777",
    primary: "#FFB682",
    error: "error",
    warning: "warning",
    info: "info",
    success: "#8BC18D",
  };
  return <Chip icon={<Badge />} label={text} variant={} />;
};

export default PillBadge;
