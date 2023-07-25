import { Grid, Typography } from "@mui/material";
import React from "react";
import { AWSIcon, AzureIcon, MinIOIcon, GCPIcon } from "./icons";
import FolderIcon from "@mui/icons-material/Folder";

export default function VolumeSelector() {
  return (
    <div
      style={{ background: "#e8e8e8", textAlign: "center", padding: "1rem" }}
    >
      <Typography variant="overline">Clouds</Typography>
      <VolumeChoice label="Azure" Icon={AzureIcon} />
      <VolumeChoice label="S3" Icon={AWSIcon} />
      <VolumeChoice label="GCP" Icon={GCPIcon} />
      <VolumeChoice label="MinIO" Icon={MinIOIcon} />
      <Typography variant="overline">Local</Typography>
      <VolumeChoice label="Azure" Icon={FolderIcon} />
    </div>
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
