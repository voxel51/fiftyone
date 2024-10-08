import React from "react";
import { Badge, Chip } from "@mui/material";

const PillBadge = ({
  text,
  style,
}: {
  text: string;
  color?: string;
  style?: React.CSSProperties;
}) => {
  COLORS = {
    default: "grey",
    success: "green",
    warning: "orange",
    error: "red",
  };
  return (
    <span style={style ?? {}}>
      <Chip icon={<Badge />} label={text} variant={} />
      {text}
    </span>
  );
};

export default PillBadge;
