/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { scrollable } from "@fiftyone/components";
import { useCurrentTheme } from "@fiftyone/state";
import {
  Button,
  CheckIcon,
  ContentCopyIcon,
  Size,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useEffect, useState } from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import a11yDark from "react-syntax-highlighter/dist/esm/styles/hljs/a11y-dark";
import a11yLight from "react-syntax-highlighter/dist/esm/styles/hljs/a11y-light";

import styles from "./CodeBlock.module.css";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("python", python);

/** Code to run elsewhere, highlighted, with copying it one click away. */
export default function CodeBlock({
  code,
  language = "python",
}: {
  code: string;
  language?: "bash" | "javascript" | "python";
}) {
  const theme = useCurrentTheme();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => undefined,
    );
  }, [code]);

  useEffect(() => {
    if (!copied) return undefined;

    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className={styles.block}>
      <Button
        className={styles.copy}
        variant={Variant.Secondary}
        size={Size.Sm}
        leadingIcon={copied ? CheckIcon : ContentCopyIcon}
        title={copied ? "Copied" : "Copy"}
        aria-label={copied ? "Copied" : "Copy"}
        onClick={copy}
      />
      <SyntaxHighlighter
        showLineNumbers
        className={scrollable}
        language={language}
        customStyle={{ margin: 0, lineHeight: 1.75 }}
        // The App's base palette is dark, so an unknown mode falls to dark
        // rather than painting black on dark
        style={theme === "light" ? a11yLight : a11yDark}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
