import Editor from "@monaco-editor/react";
import { Box, useColorScheme } from "@mui/material";
import React from "react";
import Header from "./Header";

export default function CodeView(props) {
  const { mode } = useColorScheme();
  const { onChange, path, schema } = props;
  const { default: defaultValue, view = {} } = schema;
  const { language, read_only: readOnly } = view;

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
    >
      <Header {...view} />
      <Editor
        height={250}
        theme={mode === "dark" ? "vs-dark" : "light"}
        defaultValue={defaultValue}
        onChange={(value) => onChange(path, value)}
        language={language}
        options={{ readOnly }}
      />
    </Box>
  );
}
