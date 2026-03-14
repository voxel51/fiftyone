import React from "react";
import { Box, Button } from "@mui/material";
import { Add, Close, DeleteForever } from "@mui/icons-material";

interface UploadActionsProps {
  showAddMore: boolean;
  showCancelAll: boolean;
  onAddMore: () => void;
  onCancelAll: () => void;
  onDeleteAll: () => void;
}

export default function UploadActions({
  showAddMore,
  showCancelAll,
  onAddMore,
  onCancelAll,
  onDeleteAll,
}: UploadActionsProps) {
  return (
    <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
      {showAddMore && (
        <Button
          size="small"
          variant="contained"
          startIcon={<Add />}
          onClick={onAddMore}
        >
          Add More
        </Button>
      )}
      {showCancelAll && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Close />}
          onClick={onCancelAll}
        >
          Cancel All
        </Button>
      )}
      <Button
        size="small"
        variant="outlined"
        color="error"
        startIcon={<DeleteForever />}
        onClick={onDeleteAll}
      >
        Delete All
      </Button>
    </Box>
  );
}
