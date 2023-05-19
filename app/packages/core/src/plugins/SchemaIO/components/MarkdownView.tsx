import React from "react";
import { Typography, Box, Link } from "@mui/material";
import ReactMarkdown from "react-markdown";
import CodeView from "./CodeView";
import { HeaderView } from ".";
import styled from "styled-components";
import { getComponentProps } from "../utils";

const InlineCode = styled.span`
  background: ${({ theme }) => theme.background.level1};
  color: ${({ theme }) => theme.voxel[500]};
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-size: 85%;
  font-family: Monaco, Consolas, "Andale Mono", "DejaVu Sans Mono", monospace;
`;

const componenntMap = {
  a({ children, ...props }) {
    return <Link {...props}>{children}</Link>;
  },
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "text";
    return !inline && match ? (
      <CodeView
        schema={{
          view: {
            language,
            height: "auto",
          },
        }}
        data={String(children).replace(/\n$/, "")}
      />
    ) : (
      <InlineCode className={className} {...props}>{children}</InlineCode>
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
