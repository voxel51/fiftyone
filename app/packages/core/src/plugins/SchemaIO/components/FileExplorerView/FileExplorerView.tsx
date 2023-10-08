import Folder from "@mui/icons-material/Folder";
import { TextField } from "@mui/material";
import React from "react";
import FieldWrapper from "../FieldWrapper";
import FileExplorer from "./FileExplorer";

export default function FileExplorerView(props) {
  const { schema, onChange, data } = props;
  const { view = {} } = schema;
  const { label, description, choose_button_label, readOnly } = view;
  const chooseMode = view.choose_dir ? "directory" : "file";

  const handleChoose = (selectedFile) => {
    onChange(props.path, selectedFile);
  };

  return (
    <FieldWrapper {...props}>
      {readOnly ? (
        <TextField
          value={data?.absolute_path}
          disabled
          InputProps={{ endAdornment: <Folder color="disabled" /> }}
          fullWidth
          size="small"
        />
      ) : (
        <FileExplorer
          label={label}
          description={description}
          chooseButtonLabel={choose_button_label}
          chooseMode={chooseMode}
          onChoose={handleChoose}
        />
      )}
    </FieldWrapper>
  );
}
