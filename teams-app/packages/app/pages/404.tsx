import { mainTitleSelector } from '@fiftyone/teams-state';
import { Box, Typography, TextField } from '@mui/material';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import Grid from '@mui/material/Grid';
import SupportOutlinedIcon from '@mui/icons-material/SupportOutlined';
import {
  CONTACT_LINK
  // DOCUMENTATION_LINK
} from '@fiftyone/teams-state/src/constants';

// This file is statically generated at build time.
/*
 * Note: You can use getStaticProps inside this page
 * if you need to fetch data at build time.
 */
function Custom404() {
  const setPageTitle = useSetRecoilState(mainTitleSelector);

  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    setPageTitle('Not found');
  }, [setPageTitle]);

  return (
    <Grid
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      width="100%"
      height="70vh"
    >
      <Grid item xs={4}>
        <Box>
          <Typography variant="body1">404</Typography>
        </Box>
        <Box pt={1}>
          <Typography variant="h6">Hmm. We couldn't find that page</Typography>
        </Box>
        <Box pt={2}>
          <Typography variant="body1">
            The page either doesn’t exist or you don’t have permission to view
            it.
          </Typography>
        </Box>
        <Box pt={1.5}>
          <Typography variant="body1">
            If you think this is an error, ask your FiftyOne team admin for
            access
          </Typography>
        </Box>
        <Box>
          <TextField
            value={searchTerm}
            type="url"
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{
              marginTop: '2rem',
              width: '100%',
              maxWidth: '400px'
            }}
            InputProps={{
              sx: { p: 0, input: { p: '0.75rem' } }
            }}
            placeholder="Search docs.voxel51.com"
            onKeyDown={(e) => {
              if (e.key == 'Enter') {
                window.open(
                  `https://docs.voxel51.com/search.html?q=${searchTerm}`,
                  '_blank'
                );
              }
            }}
          />
        </Box>
        <Box pt={2}>
          {/* <Box display="flex">
            <ImportContactsOutlinedIcon />
            <Typography variant="body1" pl={1}>
              <Link href={DOCUMENTATION_LINK}>Dataset Documentation</Link>
            </Typography>
          </Box> */}
          <a href={CONTACT_LINK} target="_blank" rel="noreferrer">
            <Box display="flex" pt={1} color="text.secondary">
              <SupportOutlinedIcon />
              <Typography variant="body1" pl={1}>
                Contact support
              </Typography>
            </Box>
          </a>
        </Box>
      </Grid>
      <Grid item xs={1} />
      <Grid item xs={4}>
        <Image
          src="/error.svg"
          height={402}
          width={296}
          alt="not found image"
        />
      </Grid>
    </Grid>
  );
}

export default Custom404;
