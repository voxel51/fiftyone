import Editor from "@monaco-editor/react";
import { Box, useColorScheme } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import autoFocus from "../utils/auto-focus";
import { getComponentProps } from "../utils";
import { useKey } from "../hooks";

export default function CodeView(props) {
  const { mode } = useColorScheme();
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
      <Editor
        key={key}
        height={height}
        theme={mode === "dark" ? "vs-dark" : "light"}
        value={data}
        defaultValue={src}
        onChange={(value) => {
          onChange(path, value);
          setUserChanged();
        }}
        language={language}
        options={{ readOnly }}
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
