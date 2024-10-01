import { InputAdornment, Button, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ContentCopy,
  SettingsInputCompositeRounded
} from '@mui/icons-material';
import { TextInput } from '@fiftyone/teams-components';
import DoneOutlinedIcon from '@mui/icons-material/DoneOutlined';

import { TextInputProps } from '../TextInput';
import { useEffect, useState } from 'react';

export default function TextInputCopy(props: TextInputProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => {
        setCopied(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const { value } = props;
  return (
    <TextInput
      {...props}
      InputProps={{
        readOnly: true,
        endAdornment: (
          <InputAdornment position="end" variant="outlined">
            <Box
              borderLeft="1px solid"
              borderColor={theme.palette.divider}
              pl={1}
            >
              <Button
                startIcon={
                  copied ? (
                    <DoneOutlinedIcon
                      sx={{ color: theme.palette.success.main }}
                    />
                  ) : (
                    <ContentCopy />
                  )
                }
                onClick={() => {
                  navigator.clipboard.writeText(value);
                  setCopied(true);
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </Box>
          </InputAdornment>
        )
      }}
    />
  );
}
