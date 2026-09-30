/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  DEFAULT_WRITE_KEYS,
  useAnalyticsInfo,
  useTrackEvent,
} from "@fiftyone/analytics";
import {
  Align,
  Button,
  Heading,
  HeadingLevel,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useEffect, useState } from "react";
import styles from "./AnalyticsConsent.module.css";
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
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.Sm}
        className={styles.copy}
      >
        <Heading level={HeadingLevel.H4}>Help us improve FiftyOne</Heading>
        <Text>
          We use cookies to understand how FiftyOne is used and improve the
          product. You can help us by allowing anonymous analytics.
        </Text>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Md}
          justify={Justify.End}
          align={Align.Center}
        >
          <Button
            data-cy="btn-disable-cookies"
            onClick={handleDisable}
            size={Size.Sm}
            variant={Variant.Borderless}
          >
            Disable
          </Button>
          <Button onClick={handleAllow} size={Size.Sm}>
            Allow
          </Button>
        </Stack>
      </Stack>
    </PinBottom>
  );
}

/** Pins the content to the bottom of the screen, floating over it. */
function PinBottom({ children }: React.PropsWithChildren) {
  return (
    <Stack
      align={Align.Center}
      className={styles.bar}
      orientation={Orientation.Column}
    >
      {children}
    </Stack>
  );
}

function ConsentTracker() {
  const trackEvent = useTrackEvent();
  useEffect(() => {
    trackEvent("analytics-consent-shown");
  }, [trackEvent]);
  return null;
}
