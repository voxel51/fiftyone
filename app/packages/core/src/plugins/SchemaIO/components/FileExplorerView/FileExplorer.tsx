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
import { setSelected } from "@fiftyone/relay";
import { getBasename, joinPaths } from "@fiftyone/utilities";

const ModalContent = styled.div`
  max-width: 90vw;
  width: 500px;
  min-width: 50vw;
  margin: 2rem;
`;

function getNameFromPath(path) {
  return getBasename(path);
}

function useSelectedFile(currentPath, chooseMode) {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const fileIsSelected = selectedFile?.type === "file";
  const dirIsSelected = selectedFile?.type === "directory";
  const unknownSelectedFile = selectedFile?.type === undefined;
  const showOpenButton =
    selectedFile?.type === "directory" &&
    selectedFile?.absolute_path !== currentPath &&
    selectedFile?.exists !== false &&
    currentPath !== selectedFile?.absolute_path;
  const canChooseDir = chooseMode === "directory" && dirIsSelected;
  const canChooseFile = chooseMode === "file" && fileIsSelected;
  const showChooseButton = canChooseDir || canChooseFile || unknownSelectedFile;

  const handleSelectFile = (file) => {
    if (!file) return setSelectedFile(null);
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
  const [currentDirectory, setCurrentDirectory] = React.useState({
    absolute_path: defaultPath,
  });
  const [open, setOpen] = React.useState(false);
  const {
    currentFiles,
    setCurrentPath,
    currentPath,
    refresh,
    errorMessage,
    onUpDir,
  } = useCurrentFiles(defaultPath);
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

  const handleOpen = (overrideSelectedFile) => {
    let targetFile = overrideSelectedFile || selectedFile;
    setCurrentDirectory(targetFile);
    setCurrentPath(targetFile.absolute_path);
    handleSelectFile(null);
  };

  const onRelPathChange = (e) => {
    const provideFilepath = e.target.value;
    if (!provideFilepath) {
      return handleSelectFile(null);
    }
    const resolvedProvidedFilepath = joinPaths(currentPath, provideFilepath);
    const matchingExistingFile = currentFiles.find(
      (f) => f.absolute_path === resolvedProvidedFilepath
    );
    let chosenFile = selectedFile;
    if (matchingExistingFile) {
      chosenFile = matchingExistingFile;
    } else if (provideFilepath) {
      chosenFile = {
        absolute_path: resolvedProvidedFilepath,
        name: getNameFromPath(resolvedProvidedFilepath),
        exists: false,
        type: chooseMode,
      };
    }
    handleSelectFile(chosenFile);
  };

  const handleChoose = () => {
    setOpen(false);
    setChosenFile(selectedFile);
    onChoose && onChoose(selectedFile || currentDirectory);
  };

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
