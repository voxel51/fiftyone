import React from "react";
import {
  Box,
  IconButton,
  LinearProgress,
  Tooltip,
  Typography,
} from "@mui/material";
import { Close, Replay, CheckCircle, ErrorOutline } from "@mui/icons-material";
import type { FileUploadItem } from "@fiftyone/upload";
import { humanReadableBytes } from "@fiftyone/utilities";
import FileThumbnail from "./FileThumbnail";
import { STATUS_COLOR } from "./constants";

interface UploadFileItemProps {
  item: FileUploadItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}

export default function UploadFileItem({
  item,
  onCancel,
  onRetry,
}: UploadFileItemProps) {
  const isInProgress =
    item.status === "uploading" || item.status === "selected";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 0.5,
        width: "100%",
      }}
    >
      <FileThumbnail file={item.file} status={item.status} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="body2" noWrap sx={{ flex: 1 }}>
            {item.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {humanReadableBytes(item.size)}
          </Typography>
          {item.status === "success" && (
            <CheckCircle sx={{ fontSize: 16 }} color="success" />
          )}
          {item.status === "error" && (
            <Tooltip title={item.error || "Upload failed"}>
              <ErrorOutline sx={{ fontSize: 16 }} color="error" />
            </Tooltip>
          )}
        </Box>
        {isInProgress && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <LinearProgress
              variant={item.progress > 0 ? "determinate" : "indeterminate"}
              value={item.progress}
              color={STATUS_COLOR[item.status]}
              sx={{ flex: 1, borderRadius: 1 }}
            />
            {item.status === "uploading" && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ minWidth: 32, textAlign: "right" }}
              >
                {item.progress}%
              </Typography>
            )}
          </Box>
        )}
      </Box>
      {item.status === "error" && (
        <Tooltip title="Retry">
          <IconButton size="small" onClick={() => onRetry(item.id)}>
            <Replay sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={isInProgress ? "Cancel" : "Remove"}>
        <IconButton size="small" onClick={() => onCancel(item.id)}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
