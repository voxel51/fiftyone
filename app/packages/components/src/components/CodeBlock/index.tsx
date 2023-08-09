import { CopyButton } from "@fiftyone/components";
import { Box, useColorScheme } from "@mui/material";
import React from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import {
  a11yDark,
  a11yLight,
} from "react-syntax-highlighter/dist/esm/styles/hljs";
import { scrollable } from "../../scrollable.module.css";

export default function CodeBlock({ text, ...props }) {
  const { mode } = useColorScheme();

  return (
    <Box
      sx={{
        position: "relative",
        fontFamily: "Roboto Mono, monospace",
        fontSize: props?.fontSize || 14,
        "&:hover": {
          "& > button": {
            opacity: 1,
          },
        },
      }}
    >
      <CopyButton
        variant="contained"
        text={text}
        sx={{
          position: "absolute",
          top: 3,
          right: 3,
          opacity: 0,
          transition: "opacity 0.3s",
        }}
        color="secondary"
        size="small"
      />
      <SyntaxHighlighter
        showLineNumbers
        className={scrollable}
        language="Python"
        customStyle={{ margin: 0, lineHeight: 1.75 }}
        style={mode === "dark" ? a11yDark : a11yLight}
        {...props}
      >
        {text}
      </SyntaxHighlighter>
    </Box>
  );
}
