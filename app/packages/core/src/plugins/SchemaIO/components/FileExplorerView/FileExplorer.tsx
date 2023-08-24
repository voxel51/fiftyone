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
import { useCurrentFiles } from "./state";

const ModalContent = styled.div`
  max-width: 90vw;
  width: 500px;
  min-width: 50vw;
  margin: 2rem;
`;

function useSelectedFile(currentPath, chooseMode) {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const fileIsSelected = selectedFile?.type === "file";
  const dirIsSelected = selectedFile?.type === "directory";
  const showOpenButton =
    selectedFile?.type === "directory" &&
    currentPath !== selectedFile?.absolute_path;
  const canChooseDir = chooseMode === "directory" && dirIsSelected;
  const canChooseFile = chooseMode === "file" && fileIsSelected;
  const showChooseButton = canChooseDir || canChooseFile;

  const handleSelectFile = (file) => {
    const allowed = file.type == chooseMode;
    if (allowed) setSelectedFile(file);
  };

  return { selectedFile, handleSelectFile, showOpenButton, showChooseButton };
}

export default function FileExplorer({
  label,
  description,
  chooseButtonLabel,
  buttonLabel,
  defaultPath,
  chooseMode,
  onChoose,
}) {
  const [open, setOpen] = React.useState(false);
  const { currentFiles, setCurrentPath, currentPath, refresh } =
    useCurrentFiles(defaultPath);
  const { selectedFile, handleSelectFile, showChooseButton, showOpenButton } =
    useSelectedFile(currentPath, chooseMode);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const [chosenFile, setChosenFile] = React.useState(null);

  const handleClickOpen = (e) => {
    setOpen(true);
    e.preventDefault();
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleOpen = () => {
    setCurrentPath(selectedFile.absolute_path);
  };
  const handleChoose = () => {
    setOpen(false);
    setChosenFile(selectedFile);
    onChoose(selectedFile);
  };

  return (
    <div>
      <Box>
        {chosenFile && (
          <TextField
            disabled={true}
            key={chosenFile?.name}
            defaultValue={chosenFile?.name}
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
                />
              </Grid>
              <Grid spacing={2} item container>
                {sidebarOpen && (
                  <Grid item>
                    <VolumeSelector />
                  </Grid>
                )}
                <Grid item sx={{ flex: 1 }}>
                  <FileTable
                    chooseMode={chooseMode}
                    files={currentFiles}
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    onOpenDir={(file) => setCurrentPath(file.absolute_path)}
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
                    value={selectedFile ? selectedFile.name : ""}
                    variant="outlined"
                    size="small"
                    fullWidth
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
