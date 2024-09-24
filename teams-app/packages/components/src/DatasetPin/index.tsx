import * as React from 'react';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { PinIcon } from '@fiftyone/teams-components';

import { useHandleDatasetPinChanged } from '@fiftyone/hooks';
import { Dataset } from '@fiftyone/teams-state';

interface Props {
  row: Dataset;
  styles?: any;
  fontSize?: string;
  isHovering?: boolean;
}

export default function DatasetPin(props: Props) {
  const { styles = {}, row, fontSize = '1.2rem', isHovering } = props;
  const theme = useTheme();
  const { slug, name, viewer } = row;
  const { pinned } = viewer;

  const { toggleDatasetPin } = useHandleDatasetPinChanged({
    slug,
    currentlyPinned: pinned,
    row
  });

  const unpinHidden = pinned || (!pinned && !isHovering);

  const pinStyles = {
    fontSize,
    color: theme.palette.grey[400],

    '&:hover': {
      color: theme.palette.grey[500]
    }
  };

  const unpinStyles = {
    ...pinStyles,
    visibility: unpinHidden ? 'hidden' : 'visible',
    opacity: unpinHidden ? '0' : '1',

    transition: 'visibility 0s, opacity 0.3s linear',
    overflow: 'hidden'
  };

  const finalStyles = { ...styles, ...(pinned ? pinStyles : unpinStyles) };

  return (
    <Box
      display="flex"
      alignItems="center"
      sx={finalStyles}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDatasetPin();
      }}
      title={`${pinned ? 'Unpin' : 'Pin'} dataset`}
      data-testid={`dataset-table-row-${name}-pin`}
    >
      <PinIcon variant={pinned ? 'contained' : 'outlined'} />
    </Box>
  );
}
