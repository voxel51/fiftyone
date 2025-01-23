import React from "react";
import CogIcon from "@mui/icons-material/Settings";
import IconButton from "../../../IconButton";

export const SelectLabels = () => {
  return (
    <IconButton
      sx={{
        "&:hover": {
          color: "var(--fo-palette-primary)",
        },
      }}
    >
      <CogIcon />
    </IconButton>
  );
};
