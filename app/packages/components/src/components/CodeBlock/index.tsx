import {
  BackgroundColor,
  BorderColor,
  Button,
  CheckIcon,
  ContentCopyIcon,
  getColorCssVar,
  Size,
  TextColor,
  Variant,
} from "@voxel51/voodo";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import scrollableStyles from "../../scrollable.module.css";
import Highlighted, { type HighlightedLanguage } from "../Highlighted";
import styles from "./CodeBlock.module.css";

const COPIED_DURATION = 2000;

type FrameProps = {
  children?: ReactNode;
  code: string;
  copyable?: boolean;
  lineNumbers?: boolean;
};

/** The props plugins were given before `code`; it is highlighted for them. */
type LegacyProps = {
  text: string;
  language?: string;
  showLineNumbers?: boolean;
  theme?: object;
  highlight?: string;
  codeBlock?: boolean;
  onCopy?: (text: string) => void;
  fontSize?: number;
};

export type CodeBlockProps = FrameProps | LegacyProps;

/**
 * A block of code, with copying it one click away.
 *
 * The block renders `code` as written. A caller that highlights its own code
 * passes the marked-up result as `children`; `code` is still what the copy
 * control puts on the clipboard, so a highlighter's markup never reaches it.
 */
const Frame = ({
  children,
  code,
  copyable = true,
  lineNumbers = false,
}: FrameProps) => {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => undefined,
    );
  }, [code]);

  useEffect(() => {
    if (!copied) return undefined;

    const timeout = setTimeout(() => setCopied(false), COPIED_DURATION);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div
      className={styles.block}
      style={{
        background: getColorCssVar(BackgroundColor.CardNested),
        color: getColorCssVar(TextColor.Primary),
      }}
    >
      {lineNumbers && (
        <ol
          aria-hidden
          className={styles.lines}
          style={{
            borderColor: getColorCssVar(BorderColor.Default),
            color: getColorCssVar(TextColor.Muted),
          }}
        >
          {code.split("\n").map((_, index) => (
            <li key={index}>{index + 1}</li>
          ))}
        </ol>
      )}
      <pre
        className={`${styles.code} ${scrollableStyles.scrollable}`}
        translate="no"
      >
        <code>{children ?? code}</code>
      </pre>
      {copyable && (
        <Button
          aria-label={copied ? "Copied" : "Copy"}
          className={styles.copy}
          leadingIcon={copied ? CheckIcon : ContentCopyIcon}
          onClick={copy}
          size={Size.Sm}
          title={copied ? "Copied" : "Copy"}
          variant={Variant.Secondary}
        />
      )}
    </div>
  );
};

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function CodeBlock(props: CodeBlockProps) {
  if ("code" in props) return <Frame {...props} />;

  const { text, language, showLineNumbers = true } = props;
  return (
    <Frame code={text} lineNumbers={showLineNumbers}>
      <Highlighted
        code={text}
        language={(language ?? "python").toLowerCase() as HighlightedLanguage}
      />
    </Frame>
  );
}
