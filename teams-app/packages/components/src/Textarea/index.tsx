import React from 'react';

import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';

interface PropsType {
  value: string;
  onChange: (e: any) => void;
  placeholder?: string;
}

export default function Textarea(props: PropsType) {
  const theme = useTheme();

  return (
    <Box display="flex" flexDirection="column" width="100%">
      <textarea
        value={props.value}
        onChange={props.onChange}
        style={{
          padding: '0.65rem',
          paddingLeft: '1.2rem',
          paddingRight: '1.2rem',
          borderRadius: '8px',
          border: `1px solid ${theme.palette.grey[300]}`,
          resize: 'none',
          fontSize: 'medium'
        }}
        placeholder={props.placeholder || ''}
        rows={7}
      />
    </Box>
  );
}
