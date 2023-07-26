import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { FileDrop as ReactFileDrop } from "react-file-drop";
import { CloudUpload } from "@mui/icons-material";
import autoFocus from "../utils/auto-focus";

type FileDropProps = {
  label?: string;
  caption?: string;
  onChange: (files: Array<File>) => void;
  /** comma separated file types. i.e. .png,.jpg,.svg */
  types?: string;
  allowMultiple?: boolean;
};

export default function FileDrop({
  label,
  caption,
  onChange,
  types,
  allowMultiple,
  autoFocused,
}: FileDropProps) {
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [files, setFiles] = useState<Array<File>>([]);
  const [fileIds, setFileIds] = useState(new Set());
  const fileInputRef = useRef(null);

  useEffect(() => {
    const updatedFileIds = new Set();
    for (const file of files) {
      updatedFileIds.add(getFileId(file));
    }
    if (onChange) onChange(files);
    setFileIds(updatedFileIds);
  }, [files]);

  function addUniqueFiles(newFiles: FileList) {
    setError("");
    const filesToAdd: Array<File> = [];
    for (const file of newFiles) {
      const fileId = getFileId(file);
      if (fileIds.has(fileId)) continue;
      filesToAdd.push(file);
    }
    const filteredFilesToAdd = filterFiles(filesToAdd, types);
    if (newFiles.length !== filteredFilesToAdd.length) {
      const errorPart = types?.includes(",") ? "files are" : "file is";
      setError(`Only ${types} ${errorPart} allowed`);
    }
    if (!allowMultiple) {
      if (filteredFilesToAdd.length > 0) setFiles([filteredFilesToAdd[0]]);
      return;
    }
    setFiles([...files, ...filteredFilesToAdd]);
  }

  return (
    <Box>
      {label && <Typography>{label}</Typography>}
      <ReactFileDrop
        onTargetClick={() => {
          fileInputRef.current.click();
        }}
        onDrop={(files, e) => {
          addUniqueFiles(files);
          if (active) setActive(false);
        }}
        onDragOver={() => {
          if (!active) setActive(true);
        }}
        onDragLeave={() => {
          if (active) setActive(false);
        }}
      >
        <Box
          className={active ? "active" : ""}
          sx={{
            p: 2,
            mb: 2,
            border: (theme) => `1px dashed ${theme.palette.divider}`,
            textAlign: "center",
            borderRadius: 1,
            cursor: "pointer",
            "&:hover, &.active": {
              background: (theme) => theme.palette.background.level3,
            },
            borderColor: (theme) => error && theme.palette.error.main,
            color: (theme) => theme.palette.text.secondary,
          }}
        >
          <Box>
            <CloudUpload sx={{ fontSize: 24 }} />
          </Box>
          <Typography
            component="span"
            sx={{ fontWeight: 600, textDecoration: "underline" }}
          >
            Click to upload
          </Typography>
          <Typography component="span"> or drag and drop</Typography>
          {caption && (
            <Typography variant="subtitle1" component="p">
              {caption}
            </Typography>
          )}
          {error && (
            <Typography variant="subtitle1" component="p" color="error">
              {error}
            </Typography>
          )}
        </Box>
      </ReactFileDrop>
      <input
        autoFocus={autoFocus({ autoFocused })}
        onChange={(e) => {
          addUniqueFiles(e.target.files);
          e.target.value = null;
        }}
        ref={fileInputRef}
        type="file"
        className="hidden"
        hidden
        multiple={allowMultiple}
        accept={types}
      />
      <FileList
        files={files}
        onUpdateFiles={(updatedFiles) => {
          setFiles(updatedFiles);
        }}
      />
    </Box>
  );
}

type FileListProps = {
  files: Array<File>;
  onUpdateFiles: (files: Array<File>) => void;
};

function FileList({ files, onUpdateFiles }: FileListProps) {
  if (files.length === 0) return null;
  return (
    <Box sx={{ mb: 1, display: "flex", flexWrap: "wrap" }}>
      {files.map(({ name }) => {
        return (
          <Chip
            sx={{ m: 0.25 }}
            size="small"
            label={name}
            onDelete={() => {
              onUpdateFiles(
                files.filter(({ name: fileName }) => fileName !== name)
              );
            }}
          />
        );
      })}
    </Box>
  );
}

function filterFiles(files: Array<File>, types: FileDropProps["types"]) {
  if (typeof types !== "string" || types.trim().length === 0) return files;
  const typesArray = types.split(",");
  return files.filter((file) =>
    typesArray.some((type) => file.name.endsWith(type))
  );
}

function getFileId(file: File) {
  const { name, size, lastModified } = file;
  // todo: this may not be sufficient for de-duplication. Need a better way
  return `${name}-${size}-${lastModified}`;
}
