import React from "react";
import { Typography, Box, Link } from "@mui/material";
import ReactMarkdown from "react-markdown";
import CodeView from "./CodeView";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";

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
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
};

export default function MarkdownView(props) {
  const { data } = props;

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
