import React, { useState } from "react";
import { IconButton, TextField, Box } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import RefreshIcon from "@mui/icons-material/Refresh";
import FilterDramaIcon from "@mui/icons-material/FilterDrama";

function ExplorerActions({
  onPathChange,
  currentPath,
  onSidebarClick,
  onRefresh,
}) {
  return (
    <Box display="flex" alignItems="center" gap={1} style={{ width: "100%" }}>
      <IconButton onClick={() => onSidebarClick()}>
        <FilterDramaIcon />
      </IconButton>
      <TextField
        size="small"
        key={currentPath}
        defaultValue={currentPath}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            onPathChange(ev.target.value);
            ev.preventDefault();
          }
        }}
        variant="outlined"
        fullWidth
      />
      <IconButton
        onClick={() =>
          onPathChange(currentPath.split("/").slice(0, -1).join("/"))
        }
      >
        <ArrowUpwardIcon />
      </IconButton>
      <IconButton onClick={onRefresh}>
        <RefreshIcon />
      </IconButton>
    </Box>
  );
}

export default ExplorerActions;
