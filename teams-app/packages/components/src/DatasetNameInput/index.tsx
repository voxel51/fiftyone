import { useTheme } from '@fiftyone/components';
import { DatasetURL } from '@fiftyone/teams-components';
import {
  Dataset,
  useCurrentDataset,
  useIsEditingDatasetName
} from '@fiftyone/teams-state';
import { MAX_DATASET_NAME_LEN } from '@fiftyone/teams-state/src/constants';
import { Box, Button, TextField, Typography } from '@mui/material';
import { Suspense, useEffect } from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

interface PropsType {
  dataCy?: string;
  label: string;
  value: string;
  slug?: string;
  onChange: (e: any) => void;
  direction?: 'h' | 'v';
  withDatasetUrl?: boolean;
  disabled?: boolean;
  initialEditMode?: boolean;
  inputProps: {};
}

export default function DatasetNameInput(props: PropsType) {
  const theme = useTheme();
  const {
    dataCy,
    slug,
    direction,
    withDatasetUrl,
    disabled: isDisabled,
    initialEditMode,
    label,
    value,
    onChange,
    inputProps
  } = props;

  const currentDataset: Dataset | null = useCurrentDataset(slug as string);

  const [isEditing, setIsEditing] = useIsEditingDatasetName();

  const dir = direction || 'v';
  const isVertical = dir === 'v';
  const showDatasetUrl = withDatasetUrl || false;
  const disabled = !!isDisabled;

  const shouldShowInput = (!disabled && initialEditMode) || isEditing;

  useEffect(() => {
    setIsEditing(false);
  }, [slug]);

  return (
    <Box display="flex" width="100%" flexDirection="row">
      <Box
        display="flex"
        justifyContent={dir === 'h' ? 'space-between' : 'start'}
        flexDirection={dir === 'h' ? 'row' : 'column'}
        width="100%"
        alignItems={dir === 'h' ? 'center' : 'start'}
      >
        <Box display="flex" flex="1" height="100%">
          <Typography variant="body1" noWrap paddingLeft={0.5} pb={1} pl={0}>
            {label}
          </Typography>
        </Box>
        <Box
          display="flex"
          flex="3"
          width="100%"
          justifyContent="end"
          pl={isVertical ? 0 : 2}
          maxWidth="100%"
          {...inputProps}
        >
          {!isEditing && (
            <Box display="flex" flex="3">
              <Typography
                variant="body1"
                sx={{
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {currentDataset?.name}
              </Typography>
            </Box>
          )}
          {!disabled && !isEditing && !initialEditMode && (
            <Box onClick={() => setIsEditing(true)} display="flex">
              <Button variant="outlined" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            </Box>
          )}
          {shouldShowInput && (
            <Box display="flex" width="100%">
              <Box display="flex" flexDirection="column" flex="3" width="100%">
                <TextField
                  data-testid="dataset-name-input"
                  variant="outlined"
                  size="small"
                  placeholder="Your dataset name"
                  onChange={onChange}
                  value={value}
                  InputProps={{ inputProps: { 'data-cy': dataCy } }}
                  defaultValue={currentDataset?.name}
                  inputProps={{ maxLength: MAX_DATASET_NAME_LEN }}
                />
                {showDatasetUrl && (
                  <Suspense
                    fallback={
                      <SkeletonTheme
                        baseColor={theme.background.level1}
                        highlightColor={theme.background.level3}
                      >
                        <Skeleton
                          count={1}
                          height={24}
                          enableAnimation
                          duration={2}
                          style={{
                            marginTop: 0,
                            marginBottom: 0
                          }}
                        />
                      </SkeletonTheme>
                    }
                  >
                    <DatasetURL />
                  </Suspense>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
