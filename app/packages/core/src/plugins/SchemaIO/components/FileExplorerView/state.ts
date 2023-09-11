import { useEffect, useState } from "react";
import { useOperatorExecutor, abortOperationsByURI } from "@fiftyone/operators";
import * as utils from "@fiftyone/utilities";
import { set } from "lodash";

const LIST_FILES = "list_files";
const DEFAULT_LIMIT = 1000;

function limitFiles(currentFiles, limit) {
  const files = currentFiles.filter((f) => f.type === "file");
  const dirs = currentFiles.filter((f) => f.type === "directory");
  return {
    limitedFiles: [...dirs, ...files.slice(0, limit)],
    fileCount: files.length,
  };
}

export function useCurrentFiles(defaultPath) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [currentPath, _setCurrentPath] = useState(defaultPath);
  const [aborted, setAborted] = useState(false);
  const executor = useOperatorExecutor(LIST_FILES);
  const currentFiles = aborted ? [] : executor.result?.files || [];
  const errorMessage = executor.error || executor.result?.error;

  const refresh = () => {
    setAborted(false);
    executor.execute({ path: currentPath });
  };
  const abort = () => {
    setAborted(true);
  };
  const setCurrentPath = (path) => {
    if (path) _setCurrentPath(path);
  };
  const onUpDir = () => {
    const parentPath = utils.resolveParent(currentPath);
    if (parentPath) _setCurrentPath(parentPath);
  };
  const nextPage = () => {
    setLimit((limit) => limit + DEFAULT_LIMIT);
  };
  const { limitedFiles, fileCount } = limitFiles(currentFiles, limit);
  const hasNextPage = fileCount >= limit;

  useEffect(refresh, [currentPath]);

  return {
    abort,
    setCurrentPath,
    refresh,
    currentFiles: limitedFiles,
    currentPath,
    errorMessage: aborted ? "Listing files cancelled." : errorMessage,
    onUpDir,
    loading: aborted ? false : executor.isExecuting,
    nextPage,
    hasNextPage,
  };
}

function getFilesystemsFromList(filesystems) {
  const azure = filesystems.find((fs) => fs.name.toLowerCase() === "azure");
  const s3 = filesystems.find((fs) => fs.name.toLowerCase() === "s3");
  const gcp = filesystems.find((fs) => fs.name.toLowerCase() === "gcp");
  const minio = filesystems.find((fs) => fs.name.toLowerCase() === "minio");
  const local = filesystems.find((fs) => fs.name.toLowerCase() === "local");
  return { azure, s3, gcp, minio, local };
}

export function useAvailableFileSystems() {
  const executor = useOperatorExecutor("list_files");
  const filesystems = executor.result?.filesystems || [];
  const available = filesystems.length > 0;
  const { azure, s3, gcp, minio, local } = getFilesystemsFromList(filesystems);
  const hasCloud = azure || s3 || gcp || minio;
  const defaultFilesystem = filesystems[0];
  const defaultPath = defaultFilesystem?.default_path;
  const defaultFile = defaultPath ? { absolute_path: defaultPath } : null;
  const refresh = () => {
    executor.execute({ list_filesystems: true });
  };

  useEffect(refresh, []);

  if (executor.error) {
    throw executor.error;
  }

  return {
    ready: executor.hasResultOrError,
    refresh,
    filesystems,
    available,
    defaultFile,
    hasCloud,
    azure,
    s3,
    gcp,
    minio,
    local,
  };
}

function getNameFromPath(path) {
  return utils.getBasename(path);
}

export function useSelectedFile(currentPath, chooseMode) {
  const [selectedFile, setSelectedFile] = useState(null);
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
  const enableChooseButton =
    canChooseDir || canChooseFile || unknownSelectedFile;

  const handleSelectFile = (file) => {
    if (!file) return setSelectedFile(null);
    setSelectedFile(file);
  };

  return { selectedFile, handleSelectFile, showOpenButton, enableChooseButton };
}

export function useFileExplorer(fsInfo, chooseMode, onChoose) {
  const [currentDirectory, setCurrentDirectory] = useState(fsInfo.defaultFile);
  const [open, setOpen] = useState(false);
  const {
    abort,
    currentFiles,
    setCurrentPath: _setCurrentPath,
    currentPath,
    refresh,
    errorMessage,
    onUpDir,
    loading,
    nextPage,
    hasNextPage,
  } = useCurrentFiles(fsInfo.defaultFile?.absolute_path);
  const { selectedFile, handleSelectFile, showOpenButton, enableChooseButton } =
    useSelectedFile(currentPath, chooseMode);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chosenFile, setChosenFile] = useState(null);

  const handleClickOpen = (e) => {
    setOpen(true);
    e.preventDefault();
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleOpen = (overrideSelectedFile?) => {
    const targetFile = overrideSelectedFile || selectedFile;
    setCurrentDirectory(targetFile);
    _setCurrentPath(targetFile.absolute_path);
    handleSelectFile(null);
  };

  const onRelPathChange = (e) => {
    const provideFilepath = e.target.value;
    if (!provideFilepath) {
      return handleSelectFile(null);
    }
    const resolvedProvidedFilepath = utils.joinPaths(
      currentPath,
      provideFilepath
    );
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
    const file = selectedFile ||
      currentDirectory || { absolute_path: currentPath };
    setChosenFile(file);
    onChoose && onChoose(file);
  };

  const clear = () => {
    setChosenFile(null);
    setOpen(false);
    onChoose && onChoose(null);
  };

  const handleUpDir = () => {
    onUpDir();
    handleSelectFile(null);
    setCurrentDirectory(null);
  };

  return {
    abort,
    clear,
    open,
    handleClickOpen,
    handleClose,
    handleOpen,
    handleChoose,
    currentFiles,
    setChosenFile,
    setCurrentPath(path) {
      _setCurrentPath(path);
      setSidebarOpen(false);
    },
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
    enableChooseButton,
    handleUpDir,
    nextPage,
    hasNextPage,
  };
}
