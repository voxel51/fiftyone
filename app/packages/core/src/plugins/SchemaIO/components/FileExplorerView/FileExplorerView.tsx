import { CopyButton, useTheme } from "@fiftyone/components";
import {
  Box,
  Link,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import { useHover } from "react-laag";
import ReactMarkdown from "react-markdown";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import ts from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import tomorrow from "react-syntax-highlighter/dist/esm/styles/hljs/tomorrow";
import vs2015 from "react-syntax-highlighter/dist/esm/styles/hljs/vs2015";
import styled from "styled-components";
import { HeaderView } from "..";
import { getComponentProps } from "../../utils";
import remarkGfm from "remark-gfm";
import FileExplorer from "./FileExplorer";

export default function FileExplorerView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const { label, description, defaultPath } = view;

  return <FileExplorer defaultPath={defaultPath} files={[]} />;
}
