import {
  newDatasetNameState,
  nameAvailableState,
  useCurrentDataset,
  Dataset,
  DatasetSlugQuery
} from '@fiftyone/teams-state';
import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import React, {useEffect, useMemo, useState} from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useLazyLoadQuery } from 'react-relay';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { useRouter } from 'next/router';
import { useURLInfo } from '@fiftyone/hooks';
import { toSlug } from '@fiftyone/utilities';
export default function DatasetURL() {
  const theme = useTheme();
  const { host } = useURLInfo();

  const {
    query: { slug }
  } = useRouter();
  const currentDataset: Dataset | null = useCurrentDataset(slug as string);
  const { name: currentDatasetName } = currentDataset || {};
  const newDatasetName = useRecoilValue<string>(newDatasetNameState);
  const setNameAvailable = useSetRecoilState<boolean>(nameAvailableState);
  const shouldSkip = useMemo(() => !(newDatasetName || currentDatasetName) || (toSlug(newDatasetName || '').length < 1), [newDatasetName, currentDatasetName]);
  const { datasetSlug } = useLazyLoadQuery(
    DatasetSlugQuery,
    {
      name: newDatasetName || currentDatasetName || '',
      skip:shouldSkip
    },
    { fetchPolicy: 'network-only' }
  );
  const { slug: newSlug, available } = datasetSlug || {};
  const showAvailability = newSlug !== slug;
  const [urlBoxHeight, setUrlBoxHeight] = useState<number>(0);

  useEffect(() => {
    if (newDatasetName.length > 0) {
      setUrlBoxHeight(30);
    } else {
      setUrlBoxHeight(0);
    }
  }, [newDatasetName]);

  useEffect(() => {
    if (currentDatasetName === newDatasetName) {
      setNameAvailable(false);
    } else {
      setNameAvailable(available);
    }
  }, [available, currentDataset, newDatasetName]);

  return (
    <Box
      display="flex"
      flexDirection="row"
      sx={{
        height: urlBoxHeight,
        transition: 'height 0.5s ease-in',
        overflow: 'hidden',
        justifyContent: 'space-between'
      }}
    >
      <Box
        display="flex"
        sx={{ pt: 1, alignItems: 'center', maxWidth: 'calc(100% - 100px)' }}
      >
        <Typography noWrap fontWeight="medium" lineHeight={1}>
          {`${host}/`}
          <Typography noWrap fontWeight="bold" display="inline">
            {newSlug || slug}
          </Typography>
        </Typography>
      </Box>
      <Box display="flex" maxWidth="40%" flexDirection="row" alignItems="end">
        {newDatasetName && newSlug && showAvailability && (
          <Typography
            variant="h5"
            sx={{
              color: !available
                ? // @ts-ignore
                  theme.palette.error.main
                : // @ts-ignore
                  theme.palette.success.main
            }}
            fontSize={14}
          >
            {`${!available ? ' Not' : ''} available`}
            {!available ? (
              <CloseOutlinedIcon
                fontSize="small"
                sx={{
                  marginLeft: 0.5,
                  verticalAlign: 'middle',
                  // @ts-ignore
                  color: theme.palette.error.main
                }}
              />
            ) : (
              <CheckOutlinedIcon
                fontSize="small"
                sx={{
                  marginLeft: 0.5,
                  verticalAlign: 'middle',
                  // @ts-ignore
                  color: theme.palette.success.main
                }}
              />
            )}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
