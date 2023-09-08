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
  Stack,
  TextField,
  IconButton,
} from "@mui/material";
import { useFileExplorer } from "./state";
import Close from "@mui/icons-material/Close";

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
    currentFiles,
    setChosenFile,
    setCurrentPath,
    currentPath,
    refresh,
    errorMessage,
    onUpDir,
    handleSelectFile,
    selectedFile,
    showOpenButton,
    onRelPathChange,
    sidebarOpen,
    setSidebarOpen,
    chosenFile,
    loading,
  } = useFileExplorer(fsInfo, chooseMode, onChoose);

  const disableChoose = chooseMode !== (selectedFile || currentDirectory)?.type;

  const handleUpDir = () => {
    onUpDir();
    handleSelectFile(null);
  };

  return (
    <div>
      <Box>
        {chosenFile && (
          <TextField
            size="small"
            fullWidth
            value={chosenFile?.absolute_path || ""}
            InputProps={{
              endAdornment: (
                <IconButton
                  onClick={(e) => {
                    setChosenFile(null);
                    e.stopPropagation();
                  }}
                  title="Clear"
                >
                  <Close />
                </IconButton>
              ),
              readOnly: true,
            }}
            sx={{ input: { cursor: "pointer" } }}
            onClick={handleClickOpen}
          />
        )}
        {!chosenFile && (
          <Button variant="outlined" onClick={handleClickOpen}>
            {buttonLabel || "Choose"}
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
                  onUpDir={handleUpDir}
                  errorMessage={errorMessage}
                  loading={loading}
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
                    onChoose={handleChoose}
                  />
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Box
                  display="flex"
                  alignItems="center"
                  gap={2}
                  style={{ width: "100%" }}
                >
                  <TextField
                    variant="outlined"
                    size="small"
                    fullWidth
                    value={selectedFile?.name || ""}
                    onChange={onRelPathChange}
                    placeholder={`Select a ${chooseMode} or type a name or path`}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button onClick={handleClose}>Cancel</Button>
                    {showOpenButton && (
                      <Button
                        onClick={() => {
                          handleOpen();
                        }}
                      >
                        Open
                      </Button>
                    )}
                    <Button
                      onClick={handleChoose}
                      autoFocus
                      disabled={disableChoose}
                      title={
                        disableChoose
                          ? `You must select a ${chooseMode}`
                          : undefined
                      }
                    >
                      {chooseButtonLabel || "Choose"}
                    </Button>
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
