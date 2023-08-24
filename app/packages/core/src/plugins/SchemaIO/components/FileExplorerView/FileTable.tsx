import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import moment from "moment";
import styled from "styled-components";
import { scrollable } from "@fiftyone/components";

const Wrapper = ({ children }) => (
  <Paper
    style={{
      height: "500px",
      maxHeight: "80vh",
      minHeight: "40vh",
      overflowY: "auto",
      width: "100%",
    }}
    className={scrollable}
  >
    {children}
  </Paper>
);

function humanReadableBytes(bytes: number): string {
  const units: string[] = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  if (bytes === 0) return "0 Byte";

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + units[i];
}

function FileTable({
  chooseMode,
  files,
  selectedFile,
  onSelectFile,
  onChoose,
  onOpenDir,
}) {
  const handleRowClick = (file) => {
    onSelectFile(file);
  };
  const handleRowDoubleClick = (file) => {
    if (file.type === "directory") {
      onOpenDir(file);
    } else {
      onChoose(file);
    }
  };

  return (
    <TableContainer component={Wrapper}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Modified</TableCell>
            <TableCell>Size</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {files.map((file) => (
            <TableRow
              key={file.name}
              onClick={() => handleRowClick(file)}
              onDoubleClick={() => handleRowDoubleClick(file)}
              sx={{
                td: {
                  color: (theme) =>
                    chooseMode !== file.type
                      ? theme.palette.text.secondary
                      : "inherit",
                },
                backgroundColor: (theme) =>
                  selectedFile === file
                    ? theme.palette.background.paper
                    : "none",
                "&:last-child td, &:last-child th": { border: 0 },
              }}
            >
              <TableCell>
                <Box display="flex" alignItems="center">
                  {file.type === "directory" ? (
                    <FolderIcon />
                  ) : (
                    <InsertDriveFileIcon />
                  )}
                  <Box paddingLeft={1}>{file.name}</Box>
                </Box>
              </TableCell>
              <TableCell>{moment(file.date_modified).fromNow()}</TableCell>
              <TableCell>{humanReadableBytes(file.size)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default FileTable;
