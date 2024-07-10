import { Box, Grid, Link, Typography } from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import Button from "../Button";

const FIFTYONE_DO_NOT_TRACK_LS = "fiftyone-do-not-track";

function useAnalyticsConsent(disabled?: boolean) {
  const [show, setShow] = useState(false);
  const doNotTrack = window.localStorage.getItem(FIFTYONE_DO_NOT_TRACK_LS);
  useEffect(() => {
    if (disabled || doNotTrack === "true" || doNotTrack === "false") {
      setShow(false);
    } else {
      setShow(true);
    }
  }, [disabled, doNotTrack]);

  const handleAccept = useCallback(() => {
    window.localStorage.setItem(FIFTYONE_DO_NOT_TRACK_LS, "false");
    setShow(false);
  }, []);

  return { show, handleAccept };
}

export default function AnalyticsConsent() {
  const { show, handleAccept } = useAnalyticsConsent();

  if (!show) {
    return null;
  }

  return (
    <PinBottom>
      <Grid
        container
        direction="column"
        alignItems="center"
        borderTop={(theme) => `1px solid ${theme.palette.divider}`}
        backgroundColor="background.paper"
      >
        <Grid padding={2}>
          <Typography variant="h6" marginBottom={1}>
            Help us improve FiftyOne
          </Typography>
          <Typography marginBottom={1}>
            We use our own and third party cookies to understand how you use
            FiftyOne and to improve the product. You can help us by enabling
            analytics.
          </Typography>
          <Grid container gap={2} justifyContent="end" direction="row">
            <Grid item alignContent="center">
              <Link href="/settings/account">Go to settings</Link>
            </Grid>
            <Grid item>
              <Button variant="contained" onClick={handleAccept}>
                Accept
              </Button>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </PinBottom>
  );
}

// a component that pins the content to the bottom of the screen, floating
function PinBottom({ children }: React.PropsWithChildren) {
  return (
    <Box position="fixed" bottom={0} width="100%">
      {children}
    </Box>
  );
}
