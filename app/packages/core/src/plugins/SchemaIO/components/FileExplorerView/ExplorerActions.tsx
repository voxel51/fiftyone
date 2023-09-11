import React from "react";
import {
  IconButton,
  TextField,
  Box,
  InputAdornment,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import RefreshIcon from "@mui/icons-material/Refresh";
import FilterDramaIcon from "@mui/icons-material/FilterDrama";
import Error from "@mui/icons-material/Error";
import { Cancel } from "@mui/icons-material";

function ExplorerActions({
  onPathChange,
  currentPath,
  onSidebarClick,
  onRefresh,
  onUpDir,
  errorMessage,
  loading,
  abort,
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
        InputProps={{
          endAdornment: (errorMessage || loading) && (
            <InputAdornment position="end">
              {loading && <CircularProgress size={20} />}
              {errorMessage && (
                <Tooltip title={errorMessage}>
                  <IconButton>
                    <Error
                      sx={{ color: (theme) => theme.palette.error.main }}
                    />
                  </IconButton>
                </Tooltip>
              )}
              {loading && (
                <Tooltip title="Abort">
                  <IconButton onClick={abort}>
                    <Cancel />
                  </IconButton>
                </Tooltip>
              )}
            </InputAdornment>
          ),
        }}
      />
      <IconButton onClick={onUpDir}>
        <ArrowUpwardIcon />
      </IconButton>
      <IconButton onClick={onRefresh}>
        <RefreshIcon />
      </IconButton>
    </Box>
  );
}

export default ExplorerActions;
