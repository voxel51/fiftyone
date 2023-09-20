import React from "react";
import FileExplorer from "./FileExplorer";
import FieldWrapper from "../FieldWrapper";
import { useAvailableFileSystems } from "./state";

export default function FileExplorerView(props) {
  const { schema, onChange } = props;
  const { view = {} } = schema;
  const { label, description, button_label, choose_button_label } = view;
  const chooseMode = view.choose_dir ? "directory" : "file";

  const handleChoose = (selectedFile) => {
    onChange(props.path, selectedFile);
  };

  const fsInfo = useAvailableFileSystems();

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
