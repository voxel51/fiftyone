import { Grid, Typography, Box } from "@mui/material";
import React from "react";
import * as icons from "./icons/index";
import FolderIcon from "@mui/icons-material/Folder";
import { useAvailableFileSystems } from "./state";

export default function VolumeSelector({ onOpenPath }) {
  const fs = useAvailableFileSystems();

  return (
    <Box
      sx={{
        backgroundColor: (theme) => theme.palette.background.level2,
        textAlign: "center",
      }}
    >
      {fs.hasCloud && (
        <Typography onOpen={onOpenPath} variant="overline">
          Clouds
        </Typography>
      )}
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
      {fs.hasGCP && (
        <VolumeChoice
          onOpen={onOpenPath}
          path={fs.gcp.default_path}
          label="GCP"
          Icon={icons.GCPIcon}
        />
      )}
      {fs.hasMinIO && (
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

const VolumeChoice = ({ label, onOpen, path, Icon }) => (
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
      <div>
        <Icon size={36} />
      </div>
    </div>
  </Grid>
);
