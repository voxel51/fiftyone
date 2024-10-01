import {
  useCloneDataset,
  useCurrentDatasetPermission,
  useCurrentUserPermission,
  useMutation,
  withPermissions
} from '@fiftyone/hooks';
import {
  CLONE_DATASET,
  Dataset,
  DatasetUpdateMutation,
  nameAvailableState,
  newDatasetDescriptionState,
  newDatasetNameState,
  newDatasetTagsState,
  UPDATE_DATASET,
  useCurrentDataset,
  useIsEditingDatasetName,
  VIEW_DATASET,
  VIEW_DATASET_CREATED_BY
} from '@fiftyone/teams-state';
import { CLONE_DATASET_DOCUMENTATION_LINK } from '@fiftyone/teams-state/src/constants';
import {
  Box,
  Container,
  DatasetDescriptionInput,
  DatasetModal,
  DatasetNameInput,
  TagsInput,
  Timestamp
} from '@fiftyone/teams-components';
import { timeFromNow } from '@fiftyone/teams-utilities';
import { Button, Divider, Link, Typography } from '@mui/material';
import { xor } from 'lodash';
import { useRouter } from 'next/router';
import { DatasetUpdateMutation$data } from 'queries/__generated__/DatasetUpdateMutation.graphql';
import { useEffect, useMemo, useState } from 'react';
import 'react-loading-skeleton/dist/skeleton.css';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import Layout from '../components/Layout';

function BasicInfo() {
  const [cloneModalOpen, setCloneModalOpen] = useState<boolean>(false);
  const {
    query: { slug },
    push
  } = useRouter();

  const { cloneDataset, cloningDataset, setNewCloneName, newCloneName } =
    useCloneDataset();

  const [updateDataset, updatingDataset] = useMutation(DatasetUpdateMutation);

  const currentDataset: Dataset | null = useCurrentDataset(slug as string);
  const {
    name: currentDatasetName,
    tags: currDatasetTags = [],
    createdAt,
    description: currDatasetDesc
  } = currentDataset || {};
  const currentTags = (currDatasetTags || []).map((tag) => ({
    label: tag,
    value: tag
  }));
  const setNewTags = useSetRecoilState<
    { label: string; value: string }[] | null
  >(newDatasetTagsState(currentTags));

  const isNewNameAvailable = useRecoilValue(nameAvailableState);

  const [newDatasetName, SetNewDatasetName] =
    useRecoilState<string>(newDatasetNameState);

  const [newDatasetDescription, SetNewDatasetDescription] =
    useRecoilState<string>(newDatasetDescriptionState(currDatasetDesc || ''));

  const newTags = useRecoilValue(
    newDatasetTagsState(
      currDatasetTags?.map((tag) => ({ label: tag, value: tag })) || null
    )
  );

  // clear description and tags if current dataset changes
  useEffect(() => {
    if (currentDatasetName !== newDatasetName) {
      SetNewDatasetName('');
    }
    if (currDatasetDesc !== newDatasetDescription) {
      SetNewDatasetDescription('');
    }
    if (!currDatasetTags?.length) {
      setNewTags([]);
    }
  }, [currentDataset]);

  const newTagsLabels = useMemo(
    () => newTags?.map((tag: { label: string; value: string }) => tag.label),
    [newTags]
  );

  const canUpdateDataset = useCurrentDatasetPermission([UPDATE_DATASET]);
  const canCloneDataset = useCurrentUserPermission([CLONE_DATASET]);
  const canViewCreatedBy = useCurrentUserPermission([VIEW_DATASET_CREATED_BY]);

  const [isEditingDatasetName, setIsEditing] = useIsEditingDatasetName();

  const nameHasChanged =
    !!newDatasetName && newDatasetName !== currentDatasetName;
  const descHasChanged =
    newDatasetDescription !== currDatasetDesc &&
    (newDatasetDescription || currDatasetDesc);
  const tagsHaveChanged =
    xor(
      newTags?.map((tag) => tag.label),
      currDatasetTags
    )?.length !== 0 ||
    (newTags?.length === 0 && currDatasetTags?.length !== 0);
  const noFieldChange = !nameHasChanged && !descHasChanged && !tagsHaveChanged;

  const [disableSave, setDisableSave] = useState(true);
  useEffect(() => {
    if (tagsHaveChanged || descHasChanged || updatingDataset) {
      setDisableSave(false);
    } else if (isEditingDatasetName && nameHasChanged && isNewNameAvailable) {
      setDisableSave(false);
    } else {
      setDisableSave(true);
    }
  }, [
    noFieldChange,
    updatingDataset,
    isEditingDatasetName,
    !isNewNameAvailable,
    !nameHasChanged,
    tagsHaveChanged,
    descHasChanged
  ]);

  return (
    <Layout>
      <Container>
        <DatasetModal
          open={cloneModalOpen}
          onClose={() => {
            setCloneModalOpen(false);
          }}
          visibleFields={{ description: false, tags: false }}
          title="Clone this dataset"
          actionButtonText="Clone dataset"
          loading={cloningDataset}
          handleUpdated={() => {
            if (currentDataset?.slug) {
              cloneDataset({
                sourceSlug: currentDataset.slug,
                newName: newCloneName,
                cb: (newSlug: string) => {
                  push(
                    { pathname: `/datasets/[slug]/samples` },
                    `/datasets/${newSlug}/samples`,
                    { shallow: true }
                  );
                }
              });
            }
          }}
        />
        <Box display="flex" width="100%">
          <Box
            display="flex"
            flex="2"
            justifyContent="space-between"
            alignContent="center"
            width="100%"
          >
            <DatasetNameInput
              label="Name"
              value={newDatasetName || currentDatasetName || ''}
              onChange={(e) => SetNewDatasetName(e.target.value)}
              direction="h"
              withDatasetUrl
              slug={slug as string}
              disabled={!canUpdateDataset}
              inputProps={{ width: '77%' }}
            />
          </Box>
        </Box>
        <Divider sx={{ padding: 1, paddingLeft: 0.5, paddingRight: 0.5 }} />
        <Box display="flex" width="100%" pt={2}>
          <DatasetDescriptionInput
            value={newDatasetDescription}
            onChange={(e: any) => SetNewDatasetDescription(e.target.value)}
            direction="h"
            disabled={!canUpdateDataset}
          />
        </Box>
        <Divider sx={{ padding: 1, paddingLeft: 0.5, paddingRight: 0.5 }} />
        <Box display="flex" alignItems="center" width="100%">
          <TagsInput
            direction="h"
            disabled={!canUpdateDataset}
            initialValues={currentTags}
          />
        </Box>
        {canCloneDataset && (
          <>
            <Divider sx={{ padding: 1, paddingLeft: 0.5, paddingRight: 0.5 }} />
            <Box display="flex" alignItems="center" width="100%" pt={2}>
              <Box display="flex" flex="1">
                <Typography
                  variant="body1"
                  noWrap
                  paddingLeft={0.5}
                  pb={1}
                  pl={0}
                >
                  Clone
                </Typography>
              </Box>
              <Box display="flex" pr={1} flexDirection="column" flex="3">
                <Box>
                  <Button
                    size="medium"
                    variant="outlined"
                    onClick={() => {
                      setNewCloneName(currentDatasetName + '-clone');
                      setCloneModalOpen(true);
                    }}
                    disabled={cloningDataset}
                  >
                    Clone this dataset...
                  </Button>
                </Box>
                <Box width="100%" pt={1.5}>
                  <Typography variant="body1">
                    Cloning a dataset creates an independent copy of the dataset
                    with identical contents backed by the same source media
                    files.
                  </Typography>
                  <Box width="100%" pt={0.5}>
                    <Typography variant="body1" component="span">
                      <Link
                        href={CLONE_DATASET_DOCUMENTATION_LINK}
                        target="_blank"
                      >
                        Learn more about cloning datasets.
                      </Link>
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          </>
        )}
      </Container>
      <Box display="flex" flexDirection="row">
        <Box display="flex" flex="1" />
        <Box pt={1} pl={1} flex="3" justifyContent="start">
          <Typography variant="subtitle1">
            Dataset was created{' '}
            <Timestamp timestamp={createdAt as string} variant="subtitle1" />
            {currentDataset?.createdBy?.name && canViewCreatedBy
              ? ` by ${currentDataset?.createdBy?.name}`
              : ''}
          </Typography>
        </Box>
      </Box>
      {canUpdateDataset && (
        <Box display="flex" pt={1} pl={1}>
          <Box display="flex" flex="1" />
          <Box display="flex" flex="3" justifyContent="end">
            <Button
              variant="outlined"
              onClick={() => {
                SetNewDatasetName(currentDatasetName || '');
                SetNewDatasetDescription(currDatasetDesc || '');
                setNewTags(currentTags);
                setIsEditing(false);
              }}
              disabled={
                !nameHasChanged &&
                !descHasChanged &&
                !tagsHaveChanged &&
                !isEditingDatasetName
              }
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={disableSave}
              sx={{ ml: 2 }}
              onClick={() => {
                // TODO:MANI move to hooks
                updateDataset({
                  successMessage: 'Successfully edited the dataset',
                  errorMessage: 'Failed to edit the dataset',
                  variables: {
                    identifier: slug,
                    name: newDatasetName || currentDatasetName,
                    description: newDatasetDescription,
                    tags: newTagsLabels
                  },
                  onCompleted: (response: {}) => {
                    const res = response as DatasetUpdateMutation$data;
                    const newSlug = res?.updateDataset?.slug;
                    const oldSlug = currentDataset?.slug;

                    const {
                      updateDataset: { description, name, tags }
                    } = res;
                    SetNewDatasetName(name);
                    SetNewDatasetDescription(description || '');
                    setNewTags(
                      tags?.map((tag) => ({ label: tag, value: tag }))
                    );

                    if (newSlug !== oldSlug) {
                      push(
                        {
                          pathname: `/datasets/[slug]/manage/basic_info`
                        },
                        `/datasets/${newSlug}/manage/basic_info`,
                        { shallow: true }
                      );
                      return;
                    }
                  },
                  onError: (error: Error) => {
                    console.error('failed to edit the dataset', error);
                  }
                });
              }}
            >
              Save changes
            </Button>
          </Box>
        </Box>
      )}
    </Layout>
  );
}

export { getServerSideProps } from 'lib/env';

export default withPermissions(BasicInfo, [VIEW_DATASET], 'dataset', {
  getLayoutProps: () => ({
    topNavProps: {
      noBorder: true
    }
  })
});
