import { Tooltip } from "@mui/material";
import React from "react";

interface Props {
  children: React.ReactNode;
  disabled?: boolean;
  text?: string;
}
export default function WithTooltip(props: Props) {
  const { children, disabled, text } = props;
  return (
    <Tooltip title={text || ""} disableHoverListener={!disabled}>
      <span
        style={{
          display: "inline-block",
          cursor: disabled ? "not-allowed" : "default",
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
}
