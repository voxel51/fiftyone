import React from "react";
import Box from "@mui/material/Box";
import AccessTime from "@mui/icons-material/AccessTime";
import { Typography } from "@mui/material";

export default function Loader() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "80vh",
        flexDirection: "column",
      }}
    >
      <AccessTime color="disabled" />
      <Typography paddingTop={1} variant="body1">
        Please wait ...
      </Typography>
    </Box>
  );
}
