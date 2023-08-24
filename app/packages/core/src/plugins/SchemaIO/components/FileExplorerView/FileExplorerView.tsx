import FileExplorer from "./FileExplorer";
import FieldWrapper from "../FieldWrapper";

export default function FileExplorerView(props) {
  const { schema, data, onChange } = props;
  const { view = {} } = schema;
  const { label, description, button_label, choose_button_label, defaultPath } =
    view;
  const chooseMode = view.choose_dir ? "directory" : "file";

  const handleChoose = (selectedFile) => {
    onChange(props.path, selectedFile);
  };

  return (
    <FieldWrapper {...props}>
      <FileExplorer
        label={label}
        description={description}
        buttonLabel={button_label}
        chooseButtonLabel={choose_button_label}
        defaultPath={defaultPath}
        chooseMode={chooseMode}
        onChoose={handleChoose}
      />
    </FieldWrapper>
  );
}
