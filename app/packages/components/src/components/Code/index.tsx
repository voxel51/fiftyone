import Editor, { EditorProps } from "@monaco-editor/react";
import { useColorScheme } from "@mui/material";
import React, { useEffect, useState } from "react";

export default function Code(props: CodeProps) {
  const { readOnly, options = {}, defaultValue, value, ...editorProps } = props;
  const { mode } = useColorScheme();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setRevision((revision) => revision + 1);
  }, []);

  return (
    <Editor
      key={`revision-${revision}`}
      theme={mode === "dark" ? "vs-dark" : "light"}
      options={{ readOnly, lineNumbers: "on", ...options }}
      defaultValue={defaultValue}
      value={value}
      {...editorProps}
    />
  );
}

type CodeProps = EditorProps & { readOnly?: boolean };
