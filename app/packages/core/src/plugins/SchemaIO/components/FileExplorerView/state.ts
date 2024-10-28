import { useEffect, useState } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";
import { resolveParent, joinPaths } from "@fiftyone/utilities";
import {
  getNameFromPath,
  computeFileObject,
  limitFiles,
  getFileSystemsFromList,
} from "./utils";

const LIST_FILES = "list_files";
const DEFAULT_LIMIT = 1000;

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
    const parentPath = resolveParent(currentPath);
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

export function useAvailableFileSystems() {
  const executor = useOperatorExecutor("list_files");
  const filesystems = executor.result?.filesystems || [];
  const available = filesystems.length > 0;
  const { azure, s3, gcs, minio, local } = getFileSystemsFromList(filesystems);
  const hasCloud = azure || s3 || gcs || minio;
  const defaultFilesystem = filesystems[0];
  const defaultPath = defaultFilesystem?.default_path;
  const defaultFile = defaultPath ? { absolute_path: defaultPath } : null;
  const refresh = () => {
    executor.execute({ list_filesystems: true });
  };

  useEffect(refresh, []);

  return {
    ready: executor.hasResultOrError,
    refresh,
    filesystems,
    available,
    defaultFile,
    hasCloud,
    azure,
    s3,
    gcs,
    minio,
    local,
    error: executor.error,
  };
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
    canChooseDir ||
    canChooseFile ||
    (unknownSelectedFile && chooseMode === "directory");

  const handleSelectFile = (file) => {
    if (!file) return setSelectedFile(null);
    setSelectedFile(file);
  };

  return { selectedFile, handleSelectFile, showOpenButton, enableChooseButton };
}

export function useFileExplorer(fsInfo, chooseMode, onChoose) {
  const [open, setOpen] = useState(false);
  const {
    abort,
    currentFiles,
    setCurrentPath,
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
  const [customPath, setCustomPath] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [customPathChanged, setCustomPathChanged] = useState(false);

  useEffect(() => {
    if (!initialized && fsInfo.defaultFile) {
      setCurrentPath(fsInfo.defaultFile?.absolute_path);
      setInitialized(true);
    }
  }, [initialized, fsInfo, setCurrentPath]);

  const handleClickOpen = (e) => {
    if (customPathChanged && typeof customPath === "string") {
      const file = computeFileObject(customPath, chooseMode);
      const { parent_path, absolute_path } = file;
      handleSelectFile(file);
      setCurrentPath(parent_path || absolute_path);
      if (onChoose) onChoose(file);
    }
    setCustomPathChanged(false);
    setOpen(true);
    e.preventDefault();
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleOpen = (overrideSelectedFile?) => {
    const targetFile = overrideSelectedFile || selectedFile;
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
    const file = selectedFile || { absolute_path: currentPath };
    setChosenFile(file);
    setCustomPath(null);
    onChoose && onChoose(file);
  };

  const clear = () => {
    setChosenFile(null);
    setOpen(false);
    setCustomPath(null);
    onChoose && onChoose(null);
  };

  const handleUpDir = () => {
    onUpDir();
    handleSelectFile(null);
  };

  const handleCustomPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const updatedCustomPath = e.target.value;
    setCustomPath(e.target.value);
    setCustomPathChanged(true);
    if (typeof updatedCustomPath === "string" && onChoose)
      onChoose(computeFileObject(updatedCustomPath, chooseMode));
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
      setCurrentPath(path);
      setSidebarOpen(false);
      handleSelectFile(null);
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
    customPath,
    handleCustomPathChange,
  };
}
