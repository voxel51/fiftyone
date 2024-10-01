import { Box, Button, JSONView } from '@fiftyone/teams-components';
import { SAMPLES_NEXT_PATH } from '@fiftyone/teams-state/src/constants';
import { FormControlLabel, Link, Stack, Switch } from '@mui/material';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';

export default function RunView(props: RunViewPropsType) {
  const { view } = props;
  const { query } = useRouter();
  const [rawMode, setRawMode] = useState(false);
  const previewModeAvailable = false;

  return (
    <Stack>
      {previewModeAvailable && (
        <FormControlLabel
          disabled={!previewModeAvailable}
          control={
            <Switch
              disabled={previewModeAvailable}
              defaultChecked={!previewModeAvailable}
              title={rawMode ? 'Active' : 'Inactive'}
              onChange={(e, checked) => setRawMode(checked)}
            />
          }
          title={
            !previewModeAvailable ? 'Preview mode is unavailable' : undefined
          }
          label="Show raw"
          sx={{ pb: 2, pl: 1 }}
        />
      )}
      {previewModeAvailable && !rawMode && (
        <Box pl={1}>
          <NextLink href={{ pathname: SAMPLES_NEXT_PATH, query }} passHref>
            <Link>
              <Button variant="contained">Load view</Button>
            </Link>
          </NextLink>
        </Box>
      )}
      {(!previewModeAvailable || rawMode) && (
        <JSONView content={view as object} collapsed={1} />
      )}
    </Stack>
  );
}

type RunViewPropsType = {
  view: unknown;
};
