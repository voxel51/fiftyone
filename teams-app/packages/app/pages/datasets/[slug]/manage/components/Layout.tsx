import { Box, layout } from '@fiftyone/teams-components';
import Nav from '../components/Nav';
import DatasetNavigation from '../../components/navigation';
import React from 'react';

const { SidePanelLayout } = layout;

export default function Layout({ children }: React.PropsWithChildren) {
  return (
    <Box>
      <Box>
        <DatasetNavigation />
      </Box>
      <SidePanelLayout containerProps={{ sx: { pl: 0, pr: 2 } }}>
        <Box paddingTop={2}>
          <Nav />
        </Box>
        <Box paddingTop={4} paddingLeft={0}>
          {children}
        </Box>
      </SidePanelLayout>
    </Box>
  );
}
