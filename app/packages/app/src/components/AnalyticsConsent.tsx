import { DEFAULT_WRITE_KEYS, useAnalyticsInfo } from "@fiftyone/analytics";
import { Button } from "@fiftyone/components";
import { Box, Grid, Link, Typography } from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import { NavGA$data } from "./__generated__/NavGA.graphql";

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
      setShow(true);
    }
  }, [disabled, doNotTrack]);

  const handleDisable = useCallback(() => {
    window.localStorage.setItem(FIFTYONE_DO_NOT_TRACK_LS, "true");
    setShow(false);
    setReady(true);
  }, []);

  const handleEnable = useCallback(() => {
    window.localStorage.setItem(FIFTYONE_DO_NOT_TRACK_LS, "false");
    setReady(true);
    setShow(false);
  }, []);

  return {
    doNotTrack: doNotTrack === "true" || disabled,
    handleDisable,
    handleEnable,
    ready,
    show,
  };
}

export default function AnalyticsConsent(info: NavGA$data) {
  const [_, setAnalyticsInfo] = useAnalyticsInfo();

  const { doNotTrack, handleDisable, handleEnable, ready, show } =
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
  }, [doNotTrack, info, ready, setAnalyticsInfo]);

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
            We use cookies to understand how FiftyOne is used and to improve the
            product. You can help us by enabling analytics.
          </Typography>
          <Grid container gap={2} justifyContent="end" direction="row">
            <Grid item alignContent="center">
              <Link style={{ cursor: "pointer" }} onClick={handleDisable}>
                Disable
              </Link>
            </Grid>
            <Grid item>
              <Button variant="contained" onClick={handleEnable}>
                Enable
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
