import React, { useCallback } from "react";
import { Typography, Box, Link, Button } from "@mui/material";
import ReactMarkdown from "react-markdown";
import CodeView from "./CodeView";
import { HeaderView } from ".";
import styled, { useTheme } from "styled-components";
import { getComponentProps } from "../utils";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import ts from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import tomorrow from "react-syntax-highlighter/dist/esm/styles/hljs/tomorrow";
import vs2015 from "react-syntax-highlighter/dist/esm/styles/hljs/vs2015";
import CopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/DoneOutlined";
import copyToClipboard from "copy-to-clipboard";

SyntaxHighlighter.registerLanguage("javascript", js);
SyntaxHighlighter.registerLanguage("typescript", ts);
SyntaxHighlighter.registerLanguage("python", python);

const InlineCode = styled.span`
  background: ${({ theme }) => theme.background.level1};
  color: ${({ theme }) => theme.voxel[500]};
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-size: 85%;
  font-family: Roboto Mono, monospace;
`;

const CodeContainer = styled(Box)`
  border: 1px solid ${({ theme }) => theme.background.level1};
  pre {
    margin: 0;
    padding: 1rem !important;
  }
  border-radius: 3px;
`;

const CodeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.background.level1};
  background: ${({ theme }) => theme.background.level2};
`;

const CopyButton = ({ content, children }) => {
  const [copied, setCopied] = React.useState(false);
  const handleClick = useCallback(() => {
    copyToClipboard(content);
    setCopied(true);
  }, [children, copyToClipboard]);

  if (copied) {
    return <Button startIcon={<CheckIcon />}>Copied!</Button>;
  }

  return (
    <Button startIcon={<CopyIcon />} onClick={handleClick}>
      {children}
    </Button>
  );
};

const componenntMap = {
  a({ children, ...props }) {
    if (
      props.href &&
      props.href.startsWith("http") &&
      !props.href.includes(window.location.host)
    ) {
      props = {
        ...props,
        target: "_blank",
      };
    }

    return <Link {...props}>{children}</Link>;
  },
  code({ node, inline, className, children, ...props }) {
    const theme = useTheme();
    const isDarkMode = theme.mode === "dark";
    const highlightTheme = isDarkMode ? vs2015 : tomorrow;
    const match = /language-(\w+)/.exec(className || "");
    let language = match ? match[1] : "text";
    if (language === "js") {
      language = "javascript";
    }
    if (language === "ts") {
      language = "typescript";
    }
    if (language === "py") {
      language = "python";
    }
    return !inline && match ? (
      <CodeContainer>
        <CodeHeader>
          <Typography variant="caption">{language}</Typography>
          <CopyButton content={children}>Copy Code</CopyButton>
        </CodeHeader>

        <SyntaxHighlighter language={language} style={highlightTheme}>
          {children}
        </SyntaxHighlighter>
      </CodeContainer>
    ) : (
      <InlineCode className={className} {...props}>
        {children}
      </InlineCode>
    );
  },
};

export default function MarkdownView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const { label, description } = view;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <ReactMarkdown
        components={componenntMap}
        {...getComponentProps(props, "markdown")}
      >
        {data}
      </ReactMarkdown>
    </Box>
  );
}
