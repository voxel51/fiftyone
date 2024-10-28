import { Box, useColorScheme } from "@mui/material";
import {
  a11yDark,
  a11yLight,
  CodeBlock as ReactCodeBlock,
} from "react-code-blocks";
import { CopyButton } from "@fiftyone/teams-components";

export default function CodeBlock({ text, ...props }: CodeBlockProps) {
  const { mode } = useColorScheme();

  return (
    <Box
      data-testid="code"
      sx={{
        position: "relative",
        fontFamily: "Roboto Mono",
        fontSize: 14,
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
      <ReactCodeBlock
        text={text}
        language="Python"
        showLineNumbers={true}
        theme={mode === "dark" ? a11yDark : a11yLight}
        codeBlock
        {...props}
      />
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
};
