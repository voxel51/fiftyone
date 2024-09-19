import { ContentCopy, DoneOutlined } from '@mui/icons-material';
import { Button, ButtonProps } from '@mui/material';
import { useEffect, useState } from 'react';

type CopyButtonProps = ButtonProps & {
  text: string;
  label?: string;
};

export default function CopyButton({
  text = '',
  label = 'Copy',
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => {
        setCopied(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  return (
    <Button
      startIcon={
        copied ? (
          <DoneOutlined sx={{ color: (theme) => theme.palette.success.main }} />
        ) : (
          <ContentCopy />
        )
      }
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
      }}
      {...props}
    >
      {copied ? 'Copied!' : label}
    </Button>
  );
}
