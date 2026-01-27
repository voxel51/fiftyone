import Editor, { EditorProps } from "@monaco-editor/react";
import { useColorScheme } from "@mui/material";
import React from "react";

export default function Code(props: CodeProps) {
  const { readOnly, options = {}, defaultValue, value, ...editorProps } = props;
  const { mode } = useColorScheme();

  return (
    <Editor
      theme={mode === "dark" ? "vs-dark" : "light"}
      options={{ readOnly, lineNumbers: "on", ...options }}
      defaultValue={defaultValue}
      value={value}
      {...editorProps}
    />
  );
}

type CodeProps = EditorProps & { readOnly?: boolean };
