import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  makeStyles,
  Box,
} from "@material-ui/core";
import FolderIcon from "@material-ui/icons/Folder";
import InsertDriveFileIcon from "@material-ui/icons/InsertDriveFile";
import moment from "moment";

const useStyles = makeStyles({
  selected: {
    backgroundColor: "#ddd",
  },
});

const Wrapper = ({ children }) => (
  <div style={{ border: "solid 1px #e8e8e8", borderBottom: "none" }}>
    {children}
  </div>
);

function FileTable({ files, selectedFile, setSelectedFile }) {
  const handleRowClick = (file) => {
    setSelectedFile(file);
  };

  const classes = useStyles({});

  return (
    <TableContainer component={Wrapper}>
      <Table size="small">
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
              className={selectedFile === file ? classes.selected : ""}
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
              <TableCell>{moment(file.dateModified).fromNow()}</TableCell>
              <TableCell>{file.size}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default FileTable;
