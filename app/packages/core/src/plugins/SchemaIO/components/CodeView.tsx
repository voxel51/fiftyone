import { Code } from "@fiftyone/components";
import { Box } from "@mui/material";
import { useKey } from "../hooks";
import { getComponentProps } from "../utils";
import autoFocus from "../utils/auto-focus";
import HeaderView from "./HeaderView";

export default function CodeView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const { language, readOnly } = view;
  const src = data;
  let height = view.height ?? 250;
  if (view.height === "auto") {
    const lineHeight = 19;
    const numLines = src.split("\n").length;
    height = lineHeight * numLines;
  }

  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <Box
      data-cy="json-editor"
      sx={{
        ...(readOnly
          ? {
              "& .cursors-layer": {
                display: "none",
              },
            }
          : {}),
      }}
      {...getComponentProps(props, "container")}
    >
      <HeaderView {...props} nested />
      <Code
        key={key}
        height={height}
        value={data}
        defaultValue={src}
        onChange={(value) => {
          onChange(path, value);
          setUserChanged();
        }}
        language={language}
        readOnly={readOnly}
        onMount={(editor) => {
          if (autoFocus(props)) {
            editor.focus();
          }
        }}
        {...getComponentProps(props, "editor")}
      />
    </Box>
  );
}
