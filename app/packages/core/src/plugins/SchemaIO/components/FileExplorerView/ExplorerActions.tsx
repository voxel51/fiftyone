import React, { useState } from "react";
import { IconButton, TextField, Box } from "@material-ui/core";
import ArrowUpwardIcon from "@material-ui/icons/ArrowUpward";
import RefreshIcon from "@material-ui/icons/Refresh";
import FilterDramaIcon from "@mui/icons-material/FilterDrama";

function ExplorerActions({
  onPathChange,
  currentPath: givenPath,
  onSidebarClick,
}) {
  const [currentPath, setCurrentPath] = useState(givenPath);

  const handlePathSubmit = (event) => {
    event.preventDefault();
    onPathChange(currentPath);
  };

  const handlePathChange = (event) => {
    setCurrentPath(event.target.value);
  };

  return (
    <Box display="flex" alignItems="center" gap={1} style={{ width: "100%" }}>
      <IconButton onClick={() => onSidebarClick()}>
        <FilterDramaIcon />
      </IconButton>
      <TextField
        size="small"
        defaultValue={givenPath}
        onChange={handlePathChange}
        onSubmit={handlePathSubmit}
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
      <IconButton onClick={() => onPathChange(currentPath)}>
        <RefreshIcon />
      </IconButton>
    </Box>
  );
}

export default ExplorerActions;
