import { useCurrentDataset, useMutation } from '@fiftyone/hooks';
import {
  Box,
  Button,
  Container,
  SectionHeader,
  TableSkeleton,
  TextInput,
  Timestamp
} from '@fiftyone/teams-components';
import {
  Dataset,
  historyCalculateDatasetLatestChangesMutation,
  historyCreateSnapshotMutation,
  historySnapshotsQuery
} from '@fiftyone/teams-state';
import SyncIcon from '@mui/icons-material/Sync';
import { Grid, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreloadedQuery } from 'react-relay';
import SnapshotStats from './SnapshotStats';

export default function CreateSnapshot(props) {
  const { queryRef, refresh } = props;
  const { name: datasetIdentifier } = useCurrentDataset() as Dataset;
  const [state, setState] = useState({ refreshCount: 0 });
  const [createSnapshot, creatingSnapshot] = useMutation(
    historyCreateSnapshotMutation
  );
  const pageData = usePreloadedQuery(historySnapshotsQuery, queryRef);
  const [calculateLatestChanges, calculating] = useMutation(
    historyCalculateDatasetLatestChangesMutation
  );
  const calculatedBefore = useRef(false);

  const { latestChanges } = pageData.dataset;

  const setField = useCallback((key: string, value: string) => {
    setState((state) => ({ ...state, [key]: value }));
  }, []);

  const calculateChanges = useCallback(() => {
    calculateLatestChanges({
      errorMessage: 'Failed to calculate latest dataset changes',
      variables: { datasetIdentifier },
      onSuccess: refresh
    });
  }, [calculateLatestChanges, datasetIdentifier, refresh]);

  useEffect(() => {
    if (latestChanges === null && !calculatedBefore.current) {
      calculateChanges();
      calculatedBefore.current = true;
    }
  }, [calculatedBefore, calculateChanges, latestChanges]);
  const { updatedAt } = latestChanges || {};

  const showSkeleton =
    (latestChanges === null && !calculatedBefore.current) || calculating;

  return (
    <Container sx={{ p: 4 }}>
      <Grid container spacing={1}>
        <Grid item xs>
          <Stack spacing={2}>
            <SectionHeader
              title="Create snapshot"
              description={
                'Creating a new snapshot creates a permanent record of your ' +
                "dataset's current contents."
              }
              containerProps={{ sx: { pb: 0 } }}
            />
            {showSkeleton ? (
              <TableSkeleton rows={1} skeletonProps={{ width: '75%' }} />
            ) : (
              <Stack>
                {latestChanges && <SnapshotStats {...latestChanges} />}
                <Stack direction="row" spacing={1}>
                  {updatedAt && (
                    <Typography color="text.tertiary">
                      Updated{' '}
                      <Timestamp timestamp={updatedAt} color="inherit" />
                    </Typography>
                  )}
                  {!latestChanges && (
                    <Typography color="text.tertiary">
                      Latest dataset changes summary is unavailable
                    </Typography>
                  )}
                  <Button
                    sx={{
                      py: 0,
                      px: 0.5,
                      fontSize: 14,
                      color: (theme) => theme.palette.text.tertiary
                    }}
                    startIcon={<SyncIcon sx={{ fontSize: '16px!important' }} />}
                    onClick={calculateChanges}
                  >
                    Refresh
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </Grid>
        <Grid item xs>
          <Stack spacing={2} key={state.refreshCount}>
            <TextInput
              fieldLabel="Name"
              fullWidth
              size="small"
              onChange={(e) => setField('snapshotName', e.target.value)}
              placeholder="Snapshot name"
            />
            <TextInput
              fieldLabel="Description (optional)"
              fullWidth
              size="small"
              rows={5}
              multiline
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Snapshot description"
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => {
                  createSnapshot({
                    variables: { ...state, datasetIdentifier },
                    successMessage: 'Successfully created a new snapshot.',
                    onSuccess() {
                      setState((state) => ({
                        refreshCount: state.refreshCount + 1
                      }));
                      refresh();
                    }
                  });
                }}
                loading={creatingSnapshot}
                disabled={creatingSnapshot || !state.snapshotName}
              >
                Save new snapshot
              </Button>
            </Box>
          </Stack>
        </Grid>
      </Grid>
    </Container>
  );
}
