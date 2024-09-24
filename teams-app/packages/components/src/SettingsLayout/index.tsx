import React from 'react';
import { layout, SettingsNav } from '@fiftyone/teams-components';
import { Box } from '@mui/material';



export default function SettingsLayout(props) {
  const { children } = props;
  const { SidePanelLayout } = layout;
  return (
    <SidePanelLayout containerProps={{ sx: { p: 0 } }}>
      <Box sx={{ paddingTop: 2 }}>
        <SettingsNav />
      </Box>
      <Box
        sx={{
          padding: 2,
          marginTop: 1.25,
          borderRadius: 1
        }}
      >
        {children}
      </Box>
    </SidePanelLayout>
  );
}
