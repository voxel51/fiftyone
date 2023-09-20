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
  CircularProgress,
} from "@mui/material";
import { useFileExplorer } from "./state";
import Close from "@mui/icons-material/Close";
import { Folder, FolderOff } from "@mui/icons-material";

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
    abort,
    clear,
    open,
    handleClickOpen,
    handleClose,
    handleOpen,
    handleChoose,
    currentFiles,
    setCurrentPath,
    currentPath,
    refresh,
    errorMessage,
    handleSelectFile,
    selectedFile,
    showOpenButton,
    onRelPathChange,
    sidebarOpen,
    setSidebarOpen,
    chosenFile,
    loading,
    enableChooseButton,
    handleUpDir,
    nextPage,
    hasNextPage,
    customPath,
    handleCustomPathChange,
  } = useFileExplorer(fsInfo, chooseMode, onChoose);

  const hasValue = customPath || chosenFile?.absolute_path;
  const fsReady = fsInfo?.ready;
  const fsAvailable = fsInfo?.available;
  const fsError = fsInfo?.error;

  return (
    <div>
      <Box>
        <TextField
          size="small"
          fullWidth
          value={(customPath ?? chosenFile?.absolute_path) || ""}
          onChange={handleCustomPathChange}
          InputProps={{
            sx: { pr: 0.5 },
            endAdornment: (
              <Stack direction="row">
                {hasValue && (
                  <IconButton
                    onClick={(e) => {
                      clear();
                      e.stopPropagation();
                    }}
                    title="Clear"
                  >
                    <Close />
                  </IconButton>
                )}
                {!fsReady && <CircularProgress size={16} sx={{ mr: 1 }} />}
                {fsReady && (
                  <Box
                    title={
                      fsAvailable
                        ? `Choose a ${chooseMode}`
                        : "File system is not available" +
                          (fsError ? `\n\n${fsError}` : "")
                    }
                  >
                    <IconButton
                      onClick={handleClickOpen}
                      disabled={!fsAvailable}
                    >
                      {fsAvailable ? <Folder /> : <FolderOff />}
                    </IconButton>
                  </Box>
                )}
              </Stack>
            ),
          }}
        />
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
                  abort={abort}
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
                    nextPage={nextPage}
                    hasNextPage={hasNextPage}
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
                      disabled={!enableChooseButton}
                      title={
                        !enableChooseButton
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
