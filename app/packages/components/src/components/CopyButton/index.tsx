import { ContentCopy, DoneOutlined } from "@mui/icons-material";
import { Button, ButtonProps } from "@mui/material";
import { useEffect, useState } from "react";

type CopyButtonProps = ButtonProps & {
  text: string;
};

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function CopyButton({ text = "", ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setCopied(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      startIcon={copied ? <DoneOutlined /> : <ContentCopy />}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
      }}
      {...props}
    >
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}
