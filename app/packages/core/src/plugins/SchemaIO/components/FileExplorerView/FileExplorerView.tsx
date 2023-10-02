import React from "react";
import FileExplorer from "./FileExplorer";
import FieldWrapper from "../FieldWrapper";
import ObjectView from "../ObjectView";

export default function FileExplorerView(props) {
  const { schema, onChange } = props;
  const { view = {} } = schema;
  const { label, description, choose_button_label, readOnly } = view;
  const chooseMode = view.choose_dir ? "directory" : "file";

  const handleChoose = (selectedFile) => {
    onChange(props.path, selectedFile);
  };

  if (readOnly) return <ObjectView {...props} />;

  return (
    <FieldWrapper {...props}>
      <FileExplorer
        label={label}
        description={description}
        chooseButtonLabel={choose_button_label}
        chooseMode={chooseMode}
        onChoose={handleChoose}
      />
    </FieldWrapper>
  );
}
