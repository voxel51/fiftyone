import { useSnackbar, VariantType } from 'notistack';
import { useTheme, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import React, { useEffect, useState } from 'react';

interface Config {
  msg?: string;
  variant?: VariantType;
  /** duration in **ms** a notification will stay visible */
  duration?: number;
}

export const DURATION_DEFAULT = 5000; //ms

export function useNotification(): [
  Config,
  React.Dispatch<React.SetStateAction<Config>>
] {
  const [conf, setConf] = useState<Config>({});
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const theme = useTheme();

  const action = (key) => (
    <IconButton
      onClick={() => {
        closeSnackbar(key);
      }}
      sx={{ color: theme.palette.text.primary }}
    >
      <Close color="inherit" fontSize="small" />
    </IconButton>
  );

  useEffect(() => {
    if (conf?.msg) {
      enqueueSnackbar(conf.msg, {
        variant: conf.variant || 'success',
        autoHideDuration: conf.duration || DURATION_DEFAULT,
        action,
        anchorOrigin: {
          horizontal: 'center',
          vertical: 'bottom'
        },
        preventDuplicate: true
      });
    }
  }, [conf]);
  return [conf, setConf];
}
