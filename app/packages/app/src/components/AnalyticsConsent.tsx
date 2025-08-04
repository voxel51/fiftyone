import { DEFAULT_WRITE_KEYS, useAnalyticsInfo, useTrackEvent } from "@fiftyone/analytics";
import { Box, Grid, Link, Typography, Button } from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import type { Analytics$data } from "./__generated__/Analytics.graphql";

const FIFTYONE_DO_NOT_TRACK_LS = "fiftyone-do-not-track";

function useAnalyticsConsent(disabled?: boolean) {
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  const doNotTrack = window.localStorage.getItem(FIFTYONE_DO_NOT_TRACK_LS);
  useEffect(() => {
    if (disabled || doNotTrack === "true" || doNotTrack === "false") {
      setShow(false);
      setReady(true);
    } else {
      // Show popup for new users (no preference set yet)
      setShow(true);
      setReady(true);
    }
  }, [disabled, doNotTrack]);

  const handleDisable = useCallback(() => {
    window.localStorage.setItem(FIFTYONE_DO_NOT_TRACK_LS, "true");
    setShow(false);
    setReady(true);
  }, []);

  const handleAllow = useCallback(() => {
    window.localStorage.setItem(FIFTYONE_DO_NOT_TRACK_LS, "false");
    setShow(false);
    setReady(true);
  }, []);

  return {
    doNotTrack: doNotTrack === "true" || disabled,
    handleDisable,
    handleAllow,
    ready,
    show,
  };
}

export default function AnalyticsConsent({
  callGA,
  info,
}: {
  callGA: () => void;
  info: Analytics$data;
}) {
  const [_, setAnalyticsInfo] = useAnalyticsInfo();

  const { doNotTrack, handleDisable, handleAllow, ready, show } =
    useAnalyticsConsent(info.doNotTrack);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const buildType = info.dev ? "dev" : "prod";
    const writeKey = DEFAULT_WRITE_KEYS[buildType];
    setAnalyticsInfo({
      userId: info.uid,
      userGroup: "fiftyone-oss",
      writeKey,
      doNotTrack: doNotTrack,
      debug: info.dev,
    });
    !doNotTrack && callGA();
  }, [callGA, doNotTrack, info, ready, setAnalyticsInfo]);

  if (!show) {
    return null;
  }

  return (
    <PinBottom>
      <ConsentTracker />
      <Grid
        container
        direction="column"
        alignItems="center"
        sx={{
          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          backgroundColor: "background.paper",
        }}
      >
        <Grid padding={2}>
          <Typography variant="h6" marginBottom={1}>
            Help us improve FiftyOne
          </Typography>
          <Typography marginBottom={1}>
            We use cookies to understand how FiftyOne is used and improve the
            product. You can help us by allowing anonymous analytics.
          </Typography>
          <Grid container gap={2} justifyContent="end" direction="row">
            <Grid item alignContent="center">
              <Link
                style={{ cursor: "pointer" }}
                onClick={handleDisable}
                data-cy="btn-disable-cookies"
              >
                Disable
              </Link>
            </Grid>
            <Grid item>
              <Button variant="contained" onClick={handleAllow}>
                Allow
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
    <Box position="fixed" bottom={0} width="100%" zIndex={51}>
      {children}
    </Box>
  );
}

function ConsentTracker() {
  const trackEvent = useTrackEvent();
  useEffect(() => {
    trackEvent("analytics-consent-shown");
  }, [trackEvent]);
  return null;
}
