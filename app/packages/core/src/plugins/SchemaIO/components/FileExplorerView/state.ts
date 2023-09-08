import { useEffect, useState } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";
import * as utils from "@fiftyone/utilities";

export function useCurrentFiles(defaultPath) {
  const [currentPath, _setCurrentPath] = useState(defaultPath);
  const executor = useOperatorExecutor("list_files");
  const currentFiles = executor.result?.files || [];
  const errorMessage = executor.error || executor.result?.error;

  const refresh = () => {
    executor.execute({ path: currentPath });
  };
  const setCurrentPath = (path) => {
    if (path) _setCurrentPath(path);
  };
  const onUpDir = () => {
    const parentPath = utils.resolveParent(currentPath);
    if (parentPath) _setCurrentPath(parentPath);
  };

  useEffect(refresh, [currentPath]);

  return {
    setCurrentPath,
    refresh,
    currentFiles,
    currentPath,
    errorMessage,
    onUpDir,
    loading: executor.isExecuting,
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
    currentFiles,
    setCurrentPath: _setCurrentPath,
    currentPath,
    refresh,
    errorMessage,
    onUpDir,
    loading,
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
  };
}
