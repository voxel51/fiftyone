import { CopyButton } from "@fiftyone/components";
import { Box, useColorScheme } from "@mui/material";
import React from "react";
// Use the `Light` build and register only the languages we render. The default
// `react-syntax-highlighter` export bundles all ~190 hljs languages (~1.4MB) onto
// the eager critical path; this keeps it to the handful we actually use.
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/hljs/yaml";
import a11yDark from "react-syntax-highlighter/dist/esm/styles/hljs/a11y-dark";
import a11yLight from "react-syntax-highlighter/dist/esm/styles/hljs/a11y-light";
import { scrollable } from "../../scrollable.module.css";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

export default function CodeBlock({
  text,
  language,
  ...props
}: CodeBlockProps) {
  const { mode } = useColorScheme();

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
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
        language={(language ?? "python").toLowerCase()}
        customStyle={{ margin: 0, lineHeight: 1.75 }}
        style={mode === "dark" ? a11yDark : a11yLight}
        {...props}
      >
        {text}
      </SyntaxHighlighter>
    </Box>
  );
}

export type CodeBlockProps = {
  text: string;
  language?: string;
  showLineNumbers?: boolean;
  theme?: object;
  highlight?: string;
  codeBlock?: boolean;
  onCopy?: (text: string) => void;
  fontSize?: number;
};
