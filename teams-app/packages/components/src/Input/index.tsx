import React from "react";

import { useTheme } from "@mui/material/styles";
import { Box } from "@mui/material";

interface PropsType {
  value: string;
  onChange: (e: any) => void;
  placeholder?: string;
  width?: string;
  disabled?: boolean;
}

export default function Input(props: PropsType) {
  const theme = useTheme();

  return (
    <Box display="flex" flexDirection="column" width={props.width || "60%"}>
      <input
        value={props.value}
        disabled={props.disabled}
        onChange={props.onChange}
        style={{
          padding: "0.65rem",
          paddingLeft: "1.2rem",
          paddingRight: "1.2rem",
          borderRadius: "8px",
          border: `1px solid ${theme.palette.grey[300]}`,
          width: "100%",
          background: theme.palette.background.default,
        }}
        placeholder={props.placeholder || ""}
      />
    </Box>
  );
}
