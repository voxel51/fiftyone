import { Grid, Typography, Box } from "@mui/material";
import React from "react";
import * as icons from "./icons/index";
import FolderIcon from "@mui/icons-material/Folder";

export default function VolumeSelector() {
  return (
    <Box
      sx={{
        backgroundColor: (theme) => theme.palette.background.level2,
        textAlign: "center",
      }}
    >
      <Typography variant="overline">Clouds</Typography>
      <VolumeChoice label="Azure" Icon={icons.AzureIcon} />
      <VolumeChoice label="S3" Icon={icons.AWSIcon} />
      <VolumeChoice label="GCP" Icon={icons.GCPIcon} />
      <VolumeChoice label="MinIO" Icon={icons.MinIOIcon} />
      <Typography variant="overline">Local</Typography>
      <VolumeChoice label="Azure" Icon={FolderIcon} />
    </Box>
  );
}

const VolumeChoice = ({ label, Icon }) => (
  <Grid item>
    <div
      style={{
        textAlign: "center",
        padding: "10px 0 5px 0",
        marginBottom: "10px",
      }}
    >
      <div>
        <Icon size={36} />
      </div>
    </div>
  </Grid>
);
