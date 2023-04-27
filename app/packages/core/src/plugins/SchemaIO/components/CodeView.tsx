import Editor from "@monaco-editor/react";
import { Box, useColorScheme } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";

export default function CodeView(props) {
  const { mode } = useColorScheme();
  const { onChange, path, schema, data } = props;
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
      <HeaderView {...props} />
      <Editor
        height={250}
        theme={mode === "dark" ? "vs-dark" : "light"}
        value={readOnly ? data : undefined}
        defaultValue={data ?? defaultValue}
        onChange={(value) => onChange(path, value)}
        language={language}
        options={{ readOnly }}
      />
    </Box>
  );
}
