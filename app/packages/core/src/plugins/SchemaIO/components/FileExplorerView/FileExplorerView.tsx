import React from "react";
import FileExplorer from "./FileExplorer";
import FieldWrapper from "../FieldWrapper";
import { useAvailableFileSystems } from "./state";
import { CircularProgress } from "@mui/material";
import { ErrorView } from "..";

export default function FileExplorerView(props) {
  const { schema, onChange } = props;
  const { view = {} } = schema;
  const { label, description, button_label, choose_button_label } = view;
  const chooseMode = view.choose_dir ? "directory" : "file";

  const handleChoose = (selectedFile) => {
    onChange(props.path, selectedFile);
  };

  const fsInfo = useAvailableFileSystems();

  if (!fsInfo.ready) {
    return (
      <FieldWrapper {...props}>
        <CircularProgress size={16} />
      </FieldWrapper>
    );
  }

  if (fsInfo.error) {
    return (
      <FieldWrapper {...props}>
        <ErrorView
          schema={{ view: { detailed: true } }}
          data={[
            {
              reason: "Failed to get available file systems",
              details: fsInfo.error,
            },
          ]}
        />
      </FieldWrapper>
    );
  }

  if (fsInfo.available === false) {
    return (
      <FieldWrapper {...props}>
        <p>File system not available</p>
      </FieldWrapper>
    );
  }

  return (
    <FieldWrapper {...props}>
      <FileExplorer
        label={label}
        description={description}
        buttonLabel={button_label}
        chooseButtonLabel={choose_button_label}
        chooseMode={chooseMode}
        onChoose={handleChoose}
        fsInfo={fsInfo}
      />
    </FieldWrapper>
  );
}
