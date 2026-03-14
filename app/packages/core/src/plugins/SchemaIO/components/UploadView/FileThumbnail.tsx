import React from "react";
import { Box } from "@mui/material";
import { InsertDriveFile, PlayCircle } from "@mui/icons-material";
import { isImageFile, isVideoFile } from "@fiftyone/upload";
import { THUMB_DISPLAY } from "./constants";
import { statusBorderColor, statusOpacity } from "./utils";
import { useFileThumbnailSrc } from "./useFileThumbnailSrc";

interface FileThumbnailProps {
  file: File;
  status: string;
}

export default function FileThumbnail({ file, status }: FileThumbnailProps) {
  const isImage = isImageFile(file);
  const isVideo = isVideoFile(file);
  const { src, containerRef } = useFileThumbnailSrc(file);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: THUMB_DISPLAY,
        height: THUMB_DISPLAY,
        borderRadius: 1,
        flexShrink: 0,
        overflow: "hidden",
        border: 2,
        borderColor: statusBorderColor(status),
        opacity: statusOpacity(status),
        transition: "border-color 0.2s, opacity 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "action.hover",
      }}
    >
      {isImage && src ? (
        <Box
          component="img"
          src={src}
          alt=""
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : isVideo ? (
        <PlayCircle sx={{ fontSize: 20, color: "text.secondary" }} />
      ) : (
        <InsertDriveFile sx={{ fontSize: 20, color: "text.secondary" }} />
      )}
    </Box>
  );
}
