import { CodeBlock as VoodoCodeBlock } from "@voxel51/voodo";
import { Highlighted, type HighlightedLanguage } from "@voxel51/voodo/code";

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

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function CodeBlock({
  text,
  language,
  showLineNumbers = true,
}: CodeBlockProps) {
  return (
    <VoodoCodeBlock code={text} lineNumbers={showLineNumbers}>
      <Highlighted
        code={text}
        language={(language ?? "python").toLowerCase() as HighlightedLanguage}
      />
    </VoodoCodeBlock>
  );
}
