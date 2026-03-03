import React from "react";
import { Box } from "@mui/material";
import type { FileUploadItem } from "@fiftyone/upload";
import UploadFileItem from "./UploadFileItem";
import { MAX_HEIGHT, ROW_HEIGHT } from "./constants";
import { useVirtualizedFileList } from "./useVirtualizedFileList";

interface UploadFileListProps {
  files: FileUploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}

export default function UploadFileList({
  files,
  onCancel,
  onRetry,
}: UploadFileListProps) {
  const {
    sortedFiles,
    containerRef,
    handleScroll,
    totalHeight,
    startIndex,
    endIndex,
  } = useVirtualizedFileList(files);

  if (files.length === 0) return null;

  return (
    <Box
      ref={containerRef}
      onScroll={handleScroll}
      sx={{
        mt: 1.5,
        maxHeight: MAX_HEIGHT,
        overflowY: "auto",
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        position: "relative",
      }}
    >
      <Box sx={{ height: totalHeight, position: "relative" }}>
        {sortedFiles.slice(startIndex, endIndex).map((item, i) => (
          <Box
            key={item.id}
            sx={{
              position: "absolute",
              top: (startIndex + i) * ROW_HEIGHT,
              left: 0,
              right: 0,
              height: ROW_HEIGHT,
              px: 1.5,
              display: "flex",
              alignItems: "center",
            }}
          >
            <UploadFileItem item={item} onCancel={onCancel} onRetry={onRetry} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
