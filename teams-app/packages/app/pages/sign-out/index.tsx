import { Box, ThemeProvider } from '@fiftyone/teams-components';
import { SIGN_IN_ENDPOINT } from '@fiftyone/teams-state/src/constants';
import { Button, Typography } from '@mui/material';
import Link from 'next/link';

function SignOut() {
  return (
    <ThemeProvider>
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}
      >
        <Typography variant="body1">Signed out successfully!</Typography>
        <Link href={SIGN_IN_ENDPOINT}>
          <Button variant="contained">Sign in</Button>
        </Link>
      </Box>
    </ThemeProvider>
  );
}

SignOut.getLayoutProps = () => {
  return { signOutPage: true };
};

export default SignOut;
