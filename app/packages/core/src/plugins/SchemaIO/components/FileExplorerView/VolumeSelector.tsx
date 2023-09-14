import {
  Grid,
  Typography,
  Box,
  CircularProgress,
  Stack,
  Tooltip,
} from "@mui/material";
import React from "react";
import * as icons from "./icons/index";
import FolderIcon from "@mui/icons-material/Folder";
import { useAvailableFileSystems } from "./state";

export default function VolumeSelector({ onOpenPath }) {
  const fs = useAvailableFileSystems();

  return (
    <Box sx={{ minWidth: 36, textAlign: "center" }}>
      {!fs.ready && (
        <Box pt={2} textAlign="center">
          <CircularProgress size={16} />
        </Box>
      )}
      {fs.hasCloud && <Typography variant="overline">Clouds</Typography>}
      {fs.azure && (
        <VolumeChoice
          onOpen={onOpenPath}
          label="Azure"
          path={fs.azure.default_path}
          Icon={icons.AzureIcon}
        />
      )}
      {fs.s3 && (
        <VolumeChoice
          onOpen={onOpenPath}
          path={fs.s3.default_path}
          label="S3"
          Icon={icons.AWSIcon}
        />
      )}
      {fs.gcs && (
        <VolumeChoice
          onOpen={onOpenPath}
          path={fs.gcs.default_path}
          label="GCS"
          Icon={icons.GCPIcon}
        />
      )}
      {fs.minio && (
        <VolumeChoice
          onOpen={onOpenPath}
          label="MinIO"
          path={fs.minio.default_path}
          Icon={icons.MinIOIcon}
        />
      )}
      {fs.local && <Typography variant="overline">Local</Typography>}
      {fs.local && (
        <VolumeChoice
          onOpen={onOpenPath}
          path={fs.local.default_path}
          label="Local"
          Icon={FolderIcon}
        />
      )}
    </Box>
  );
}

const VolumeChoice = ({ label = "", onOpen, path, Icon }) => (
  <Grid item>
    <div
      style={{
        textAlign: "center",
        padding: "10px 0 5px 0",
        marginBottom: "10px",
        cursor: "pointer",
      }}
      onClick={() => onOpen(path)}
    >
      <Stack alignItems="center">
        <Tooltip title={label}>
          <Icon size={36} />
        </Tooltip>
      </Stack>
    </div>
  </Grid>
);
