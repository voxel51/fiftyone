import * as React from "react";
import { Button } from "@fiftyone/components";
import ExplorerActions from "./ExplorerActions";
import FileTable from "./FileTable";
import VolumeSelector from "./VolumeSelector";
import styled from "styled-components";
import {
  Dialog,
  Typography,
  Box,
  Grid,
  Modal,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import {
  useAvailableFileSystems,
  useCurrentFiles,
  useFileExplorer,
} from "./state";
import { setSelected } from "@fiftyone/relay";
import { getBasename, joinPaths } from "@fiftyone/utilities";

const ModalContent = styled.div`
  max-width: 90vw;
  width: 500px;
  min-width: 50vw;
  margin: 2rem;
`;

export default function FileExplorer({
  label,
  description,
  chooseButtonLabel,
  buttonLabel,
  chooseMode,
  onChoose,
  fsInfo,
}) {
  const {
    open,
    handleClickOpen,
    handleClose,
    handleOpen,
    handleChoose,
    currentDirectory,
    setCurrentDirectory,
    currentFiles,
    setCurrentPath,
    currentPath,
    refresh,
    errorMessage,
    onUpDir,
    handleSelectFile,
    selectedFile,
    showChooseButton,
    showOpenButton,
    onRelPathChange,
    sidebarOpen,
    setSidebarOpen,
    chosenFile,
  } = useFileExplorer(fsInfo, chooseMode, onChoose);

  console.log({ fsInfo });

  return (
    <div>
      <Box>
        {chosenFile && (
          <TextField
            size="small"
            disabled={true}
            fullWidth
            value={chosenFile?.absolute_path || ""}
          />
        )}
        {!chosenFile && (
          <Button variant="outlined" onClick={handleClickOpen}>
            {buttonLabel || "Choose"}
          </Button>
        )}
        {chosenFile && (
          <Button variant="outlined" onClick={() => setChosenFile(null)}>
            Clear
          </Button>
        )}
      </Box>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        PaperProps={{ sx: { backgroundImage: "none" } }}
        maxWidth={false}
      >
        <ModalContent>
          <Grid container direction="row" spacing={1}>
            <Grid container item spacing={2}>
              <Grid item>
                <Typography variant="h6">{label}</Typography>
                {description && (
                  <Typography variant="body2">{description}</Typography>
                )}
              </Grid>
              <Grid item container>
                <ExplorerActions
                  onSidebarClick={() => setSidebarOpen((open) => !open)}
                  currentPath={currentPath}
                  selectedFile={selectedFile}
                  onPathChange={(path) => setCurrentPath(path)}
                  onRefresh={refresh}
                  onUpDir={onUpDir}
                  errorMessage={errorMessage}
                />
              </Grid>
              <Grid spacing={2} item container>
                {sidebarOpen && (
                  <Grid item>
                    <VolumeSelector
                      onOpenPath={(path) => setCurrentPath(path)}
                    />
                  </Grid>
                )}
                <Grid item sx={{ flex: 1 }}>
                  <FileTable
                    chooseMode={chooseMode}
                    files={currentFiles}
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    onOpenDir={handleOpen}
                    onChooseFile={handleChoose}
                  />
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Box
                  display="flex"
                  alignItems="center"
                  gap={1}
                  style={{ width: "100%" }}
                >
                  <TextField
                    variant="outlined"
                    size="small"
                    fullWidth
                    value={selectedFile?.name || ""}
                    onChange={onRelPathChange}
                  />
                  <Stack direction="row" spacing={2}>
                    <Button onClick={handleClose}>Cancel</Button>
                    {showOpenButton && (
                      <Button onClick={handleOpen}>Open</Button>
                    )}
                    {showChooseButton && (
                      <Button onClick={handleChoose} autoFocus>
                        {chooseButtonLabel || "Choose"}
                      </Button>
                    )}
                  </Stack>
                </Box>
              </Grid>
            </Grid>
          </Grid>
        </ModalContent>
      </Dialog>
    </div>
  );
}
