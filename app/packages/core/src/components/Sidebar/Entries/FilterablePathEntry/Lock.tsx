import { Lock } from "@mui/icons-material";
import React from "react";

export default () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Lock
        style={{
          padding: 3,
          margin: 0,
          color: "var(--fo-palette-text-secondary)",
        }}
      />
    </div>
  );
};
