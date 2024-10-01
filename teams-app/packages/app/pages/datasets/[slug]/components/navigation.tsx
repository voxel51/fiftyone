import { useCurrentUserPermission, useDatasetRedirect } from '@fiftyone/hooks';
import { Box } from '@fiftyone/teams-components';
import {
  CLONE_VIEW as CLONE_VIEW_PERMISSION,
  EXPORT_VIEW as EXPORT_VIEW_PERMISSION,
  hideHeaders,
  mainTitleSelector,
  shareDatasetOpen,
  useCurrentDataset
} from '@fiftyone/teams-state';
import { DATASET_TABS } from '@fiftyone/teams-state/src/constants';
import { Button, Tab, Tabs } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import CloneView from './CloneView';
import ExportView from './ExportView';
import ShareDataset from './Share';

const DatasetDetailLink = (slug: string, label: string, tabName: string) => {
  const router = useRouter();
  const pathname = `/datasets/${encodeURIComponent(slug)}/${tabName}`;
  const isCurrent = pathname === router.asPath;
  const box = (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isCurrent ? 'default' : 'pointer'
      }}
    >
      {label}
    </Box>
  );

  if (isCurrent) {
    return box;
  }

  return <NextLink href={pathname}>{box}</NextLink>;
};

const DatasetMenuTab = (slug: string, label: string, tabName: string) => {
  return (
    <Tab
      label={DatasetDetailLink(slug, label, tabName)}
      sx={{
        textTransform: 'capitalize',
        padding: 0,
        minWidth: 'auto',
        marginRight: 4,
        minHeight: '32px'
      }}
      value={tabName}
    />
  );
};

function DatasetNavigation() {
  const setShareDatasetOpen = useSetRecoilState(shareDatasetOpen);
  const { query, asPath } = useRouter();
  const { slug: datasetSlug } = query;
  const currentDataset = useCurrentDataset(datasetSlug as string);
  const canExport = useCurrentUserPermission([EXPORT_VIEW_PERMISSION]);
  const canClone = useCurrentUserPermission([CLONE_VIEW_PERMISSION]);
  const setPageTitle = useSetRecoilState<string>(mainTitleSelector);
  const theme = useTheme();
  useDatasetRedirect();

  const hasSamples = (currentDataset?.samplesCount as number) > 0;

  useEffect(() => {
    setPageTitle(currentDataset?.name || (datasetSlug as string));
  }, [setPageTitle, currentDataset, datasetSlug]);

  const samplesTab = DatasetMenuTab(
    datasetSlug as string,
    'Samples',
    'samples'
  );
  const historyTab = DatasetMenuTab(
    datasetSlug as string,
    'History',
    'history'
  );
  const manageTab = DatasetMenuTab(
    datasetSlug as string,
    'Manage',
    'manage/basic_info'
  );
  const runsTab = DatasetMenuTab(datasetSlug as string, 'Runs', 'runs');
  const activeTab = useMemo(
    () =>
      DATASET_TABS.find(({ path, subPaths = [], pattern }) => {
        return (
          asPath.endsWith(path) ||
          subPaths.some((subPath) => asPath.endsWith(subPath)) ||
          (pattern && pattern.test(asPath))
        );
      }),
    [asPath]
  );

  return (
    <Box
      display="Flex"
      justifyContent="space-between"
      px={2}
      bgcolor={theme.palette.background.primary}
      borderBottom={`1px solid ${theme.palette.divider}`}
      data-cy="dataset-navigation"
    >
      <Tabs
        value={activeTab?.path}
        aria-label="Dataset tabs"
        sx={{ minHeight: '32px' }}
      >
        {samplesTab}
        {historyTab}
        {runsTab}
        {manageTab}
      </Tabs>
      <Box display="flex" justifyContent="end" mb={1} alignItems="center">
        {canClone && hasSamples && <CloneView />}
        {canExport && hasSamples && <ExportView />}
        <Button
          variant="contained"
          size="small"
          onClick={() => setShareDatasetOpen(true)}
        >
          Share
        </Button>
      </Box>
    </Box>
  );
}

const WithSharing = (Component: () => JSX.Element | null) => {
  return function Wrap() {
    const hideHeadersState = useRecoilValue(hideHeaders);
    const share = useRecoilValue(shareDatasetOpen);

    return (
      <>
        {!hideHeadersState && <Component />}
        {share && <ShareDataset />}
      </>
    );
  };
};

export default WithSharing(DatasetNavigation);
