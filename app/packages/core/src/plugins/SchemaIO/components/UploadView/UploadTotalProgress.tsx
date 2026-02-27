import React from "react";
import { Box, LinearProgress, Typography } from "@mui/material";
import type { FileUploadItem } from "@fiftyone/upload";

interface UploadTotalProgressProps {
  files: FileUploadItem[];
  isUploading: boolean;
  completedFiles: number;
  failedFiles: number;
  totalFiles: number;
}

function computeTotalProgress(files: FileUploadItem[]): number {
  if (files.length === 0) return 0;
  const sum = files.reduce((acc, f) => {
    if (f.status === "success") return acc + 100;
    if (f.status === "uploading") return acc + f.progress;
    return acc;
  }, 0);
  return sum / files.length;
}

export default function UploadTotalProgress({
  files,
  isUploading,
  completedFiles,
  failedFiles,
  totalFiles,
}: UploadTotalProgressProps) {
  const totalProgress = computeTotalProgress(files);
  const uploadingCount = files.filter((f) => f.status === "uploading").length;

  return (
    <Box sx={{ mt: 1.5 }}>
      <LinearProgress
        variant="determinate"
        value={totalProgress}
        color={failedFiles > 0 ? "warning" : "success"}
        sx={{ borderRadius: 1 }}
      />
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mt: 0.5,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {isUploading
            ? `Uploading ${uploadingCount} file${
                uploadingCount !== 1 ? "s" : ""
              }...`
            : `${completedFiles} of ${totalFiles} complete`}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(totalProgress)}%
        </Typography>
      </Box>
    </Box>
  );
}
