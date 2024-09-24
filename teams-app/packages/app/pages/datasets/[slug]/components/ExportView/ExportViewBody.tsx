import { Box, RoundedTabs } from '@fiftyone/teams-components';
import { exportMode } from '@fiftyone/teams-state';
import { useRecoilState } from 'recoil';
import CloudExport from './CloudExport';
import CodeExport from './CodeExport';
import DirectExport from './DirectExport';

export default function ExportViewBody() {
  const [mode, setMode] = useRecoilState(exportMode);
  return (
    <Box sx={{ p: 2, width: '90vw', maxWidth: '560px' }} data-cy="export-body">
      <RoundedTabs
        selected={mode}
        tabs={[
          { id: 'direct', label: 'Direct download' },
          { id: 'cloud', label: 'Cloud export' },
          { id: 'code', label: 'With code' }
        ]}
        onChange={setMode}
      />
      {mode === 'direct' && <DirectExport />}
      {mode === 'cloud' && <CloudExport />}
      {mode === 'code' && <CodeExport />}
    </Box>
  );
}
