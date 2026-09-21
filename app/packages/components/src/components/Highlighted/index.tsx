/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCurrentTheme } from "@fiftyone/state";
// Use the `Light` build and register only the languages we render. The default
// `react-syntax-highlighter` export bundles all ~190 hljs languages (~1.4MB)
// onto the eager critical path.
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/hljs/yaml";
import a11yDark from "react-syntax-highlighter/dist/esm/styles/hljs/a11y-dark";
import a11yLight from "react-syntax-highlighter/dist/esm/styles/hljs/a11y-light";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);

export type HighlightedLanguage =
  | "bash"
  | "javascript"
  | "json"
  | "python"
  | "typescript"
  | "yaml";

/**
 * Code marked up by language, for a voodo `CodeBlock` to frame.
 *
 * It renders spans rather than its own `pre`, so it nests inside the block
 * that holds it.
 */
export default function Highlighted({
  code,
  language = "python",
}: {
  code: string;
  language?: HighlightedLanguage;
}) {
  const theme = useCurrentTheme();

  return (
    <SyntaxHighlighter
      CodeTag="span"
      PreTag="span"
      customStyle={{ background: "none", margin: 0, padding: 0 }}
      language={language}
      // The App's base palette is dark, so an unknown mode falls to dark
      // rather than painting black on dark
      style={theme === "light" ? a11yLight : a11yDark}
    >
      {code}
    </SyntaxHighlighter>
  );
}
