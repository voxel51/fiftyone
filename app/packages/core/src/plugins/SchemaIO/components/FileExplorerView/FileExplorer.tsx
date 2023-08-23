import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { Box, Grid, Modal, Paper, TextField } from "@material-ui/core";
import ExplorerActions from "./ExplorerActions";
import FileTable from "./FileTable";
import VolumeSelector from "./VolumeSelector";
import styled from "styled-components";
import { Typography } from "@mui/material";
import { useCurrentFiles } from "./state";

const ModalContent = styled.div`
  background: #ffffff;
  margin: 100px auto 0 auto;
  max-width: 1000px;
`;

export default function FileExplorer({ defaultPath }) {
  const [open, setOpen] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const { currentFiles, setCurrentPath, currentPath } =
    useCurrentFiles(defaultPath);
  const submitMode =
    selectedFile && selectedFile.type === "directory" ? "open" : "choose";
  const isOpen = submitMode === "open";
  const isChoose = submitMode === "choose";

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleOpen = () => {
    if (selectedFile) console.log({ selectedFile });
    setCurrentPath(selectedFile.absolute_path);
  };
  const handleChoose = () => {};

  return (
    <div>
      <Box>
        <TextField />
        <Button variant="outlined" onClick={handleClickOpen}>
          Choose a file
        </Button>
      </Box>
      <Modal
        open={open}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        fullWidth
      >
        <ModalContent>
          <Grid container direction="row" spacing={1}>
            {sidebarOpen && (
              <Grid xs={2} item style={{ background: "#e8e8e8" }}>
                <VolumeSelector />
              </Grid>
            )}
            <Grid
              xs={sidebarOpen ? 10 : null}
              container
              item
              style={{
                padding: sidebarOpen ? "0 3rem 0 3rem" : "1rem 2rem 1rem 2rem",
              }}
              spacing={sidebarOpen ? 0 : 1}
            >
              <Grid item>
                <Typography
                  variant="h6"
                  style={{
                    margin: sidebarOpen ? "1rem 0 -3rem 1rem" : "1rem 0 0 0",
                  }}
                >
                  Choose a file...
                </Typography>
              </Grid>
              <Grid item container>
                <ExplorerActions
                  onSidebarClick={() => setSidebarOpen((open) => !open)}
                  currentPath={currentPath}
                  selectedFile={selectedFile}
                />
              </Grid>
              <Grid item style={{ width: "100%" }}>
                <FileTable
                  files={currentFiles}
                  fullWidth
                  selectedFile={selectedFile}
                  setSelectedFile={setSelectedFile}
                />
              </Grid>
              <Grid
                item
                container
                style={{ margin: sidebarOpen ? "0" : "0 0 1rem 0" }}
              >
                <Box
                  display="flex"
                  alignItems="center"
                  gap={1}
                  style={{ width: "100%" }}
                >
                  <TextField
                    value={selectedFile ? selectedFile.name : ""}
                    variant="outlined"
                    size="small"
                    fullWidth
                  />
                  <Box display="flex" style={{ margin: "0 1rem 0 1rem" }}>
                    <Button
                      onClick={handleClose}
                      style={{ marginRight: "1rem" }}
                    >
                      Cancel
                    </Button>
                    {isOpen && (
                      <Button onClick={handleOpen} autoFocus>
                        Open
                      </Button>
                    )}
                    {isChoose && (
                      <Button onClick={handleChoose} autoFocus>
                        Choose
                      </Button>
                    )}
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </Grid>
        </ModalContent>
      </Modal>
    </div>
  );
}
