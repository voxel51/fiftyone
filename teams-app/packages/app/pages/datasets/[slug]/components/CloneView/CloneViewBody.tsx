import { useFetchData, useMutation } from '@fiftyone/hooks';
import { State } from '@fiftyone/state';
import {
  Box,
  Button,
  DatasetNameInput,
  TableSkeleton
} from '@fiftyone/teams-components';
import {
  DatasetCloneMutation,
  DatasetCloneMutationT,
  DatasetCloneViewMutation,
  DatasetCloneViewMutationType,
  cloneType,
  cloneViewForceClosePopoverCount,
  isEditingDatasetName,
  newDatasetNameState,
  newDatasetState
} from '@fiftyone/teams-state';
import { CLONE_OPTIONS } from '@fiftyone/teams-state/src/constants';
import { isObjectEmpty } from '@fiftyone/teams-utilities/src/isObjectEmpty';
import { ContentCopy } from '@mui/icons-material';
import { useRouter } from 'next/router';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import ViewOrDatasetSelection from '../ViewSelection';

interface SourceView {
  filters?: State.Filters;
  sampleIds?: string[];
  viewStages: State.Stage[];
}

// When current filter is none, we should clone the dataset (including runs) instead of the view
export default function CloneViewBody() {
  const router = useRouter();
  const { slug, snapshot } = router.query;
  const [type, setType] = useRecoilState(cloneType);
  const [name, setName] = useRecoilState<string>(newDatasetNameState);
  const setIsEditingDatasetName = useSetRecoilState(isEditingDatasetName);
  const { sourceView, fetchData } = useFetchData(setType);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [cloneView, cloningView] = useMutation<DatasetCloneViewMutationType>(
    DatasetCloneViewMutation
  );
  const [cloneDataset, cloningDataset] =
    useMutation<DatasetCloneMutationT>(DatasetCloneMutation);
  const [count, setCount] = useRecoilState(cloneViewForceClosePopoverCount);
  const setNewDataset = useSetRecoilState(newDatasetState);
  const ref = useRef<HTMLDivElement>();
  const isCloning = cloningView || cloningDataset;

  const isFilterNull = sourceView ? isObjectEmpty(sourceView) : true;
  const emptySourceView = {
    filters: {},
    sampleIds: [],
    viewStages: []
  } as SourceView;

  const viewOptions = useMemo(() => {
    if (isFilterNull) {
      return [
        CLONE_OPTIONS.DATASET_WITH_RUN,
        CLONE_OPTIONS.DATASET_WITHOUT_RUN
      ];
    }
    return [
      CLONE_OPTIONS.WITH_FILTER,
      CLONE_OPTIONS.DATASET_WITH_RUN,
      CLONE_OPTIONS.DATASET_WITHOUT_RUN
    ];
  }, [isFilterNull]);

  const performClone = useCallback(async () => {
    setIsEditingDatasetName(false);
    const isCloningView = type.includes('view'); // both view and view-no-filter
    const cloneOperation = isCloningView ? cloneView : cloneDataset;
    const variables = isCloningView
      ? {
          sourceView:
            type === CLONE_OPTIONS.WITH_FILTER.id
              ? sourceView
              : emptySourceView,
          sourceIdentifier: slug,
          name,
          snapshot
        }
      : { name, sourceIdentifier: slug, snapshot };

    cloneOperation({
      variables,
      successMessage: `Successfully cloned ${
        isCloningView ? 'view' : 'dataset'
      } to new dataset "${name}"`,
      errorMessage: `Failed to clone ${
        isCloningView ? 'view' : 'dataset'
      } to new dataset "${name}"`,
      onCompleted: () => {
        setName('');
        setType('current');
        setCount(count + 1);
      },
      onSuccess: (data) => {
        const newSlug = data?.createDatasetFromView?.slug;
        if (newSlug) {
          setNewDataset(newSlug);
          ref.current?.dispatchEvent(
            new CustomEvent('clone-created', {
              bubbles: true,
              detail: { slug: newSlug }
            })
          );
        }
      }
    });
  }, [
    cloneDataset,
    cloneView,
    type,
    count,
    name,
    setCount,
    setIsEditingDatasetName,
    setName,
    setNewDataset,
    setType,
    slug,
    snapshot
  ]);

  return (
    <Box
      ref={ref}
      sx={{ p: 2, width: '90vw', maxWidth: '450px' }}
      data-cy="clone-body"
    >
      <DatasetNameInput
        label="Dataset name"
        dataCy="clone-dataset-name"
        initialEditMode
        withDatasetUrl
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <Suspense fallback={<TableSkeleton rows={1} />}>
        <ViewOrDatasetSelection
          type={type}
          setType={setType}
          options={viewOptions}
        />
      </Suspense>
      <Button
        startIcon={<ContentCopy />}
        variant="contained"
        sx={{ mt: 2 }}
        data-cy="create-clone-button"
        disabled={!type || !name || isCloning}
        loading={isCloning}
        onClick={performClone}
      >
        Clone
      </Button>
    </Box>
  );
}
