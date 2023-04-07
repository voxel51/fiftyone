import Editor from "@monaco-editor/react";
import { Box, useColorScheme } from "@mui/material";
import React from "react";
import { log } from "../utils";
import Header from "./Header";

export default function CodeEditorView(props) {
  const { mode } = useColorScheme();
  log({ mode });
  const { default: defaultValue, onChange, path, schema } = props;
  const { view = {} } = schema;

  // todo: add support for readonly and remove codeblock/jsonview components
  return (
    <Box>
      <Header {...view} />
      <Editor
        height={250}
        theme={mode === "dark" ? "vs-dark" : "light"}
        defaultValue={defaultValue}
        onChange={(value) => onChange(path, value)}
      />
    </Box>
  );
}
