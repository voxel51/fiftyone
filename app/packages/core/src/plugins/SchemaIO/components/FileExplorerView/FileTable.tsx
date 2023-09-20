import React from "react";
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
import { Button } from "@fiftyone/components";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import moment from "moment";
import { scrollable } from "@fiftyone/components";

const Wrapper = ({ children }) => (
  <Paper
    style={{
      height: "50vh",
      maxHeight: "calc(100vh - 270px)",
      minHeight: "135px",
      overflowY: "auto",
      width: "100%",
    }}
    className={scrollable}
  >
    {children}
  </Paper>
);

function humanReadableBytes(bytes: number): string {
  if (!bytes) return "";

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
  nextPage,
  hasNextPage,
}) {
  const handleRowClick = (file) => {
    onSelectFile(file);
  };
  const handleRowDoubleClick = (file) => {
    if (file.type === "directory") {
      onOpenDir(file);
    } else if (chooseMode === "file") {
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
                  cursor: "pointer",
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
              <TableCell>
                {file.date_modified && moment(file.date_modified).fromNow()}
              </TableCell>
              <TableCell>{humanReadableBytes(file.size)}</TableCell>
            </TableRow>
          ))}
          {hasNextPage && (
            <TableRow>
              <TableCell colSpan={3}>
                <Box display="flex" justifyContent="center" padding={2}>
                  <Button onClick={nextPage}>Load more</Button>
                </Box>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default FileTable;
