import React from "react";
import { Box, Typography } from "@mui/material";

export default function EmptyState(props) {
  const { label } = props;
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography>No {label} added yet</Typography>
      <Typography variant="body2" color="text.secondary">
        Click the "Add {label}" button to add an item
      </Typography>
    </Box>
  );
}
