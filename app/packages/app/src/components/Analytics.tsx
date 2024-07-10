import { DEFAULT_WRITE_KEYS, useAnalyticsInfo } from "@fiftyone/analytics";
import { AnalyticsConsent } from "@fiftyone/components";
import { isElectron } from "@fiftyone/utilities";
import React, { useEffect } from "react";
import ReactGA from "react-ga4";
import { graphql, useFragment } from "react-relay";
import gaConfig from "../ga";
import { NavGA$key } from "./__generated__/NavGA.graphql";

const useGA = (info) => {
  useEffect(() => {
    if (!info || info.doNotTrack) {
      return;
    }
    const dev = info.dev;
    const buildType = dev ? "dev" : "prod";
    ReactGA.initialize(gaConfig.app_ids[buildType], {
      testMode: false,
      gaOptions: {
        storage: "none",
        cookieDomain: "none",
        clientId: info.uid,
        page_location: "omitted",
        page_path: "omitted",
        kind: isElectron() ? "Desktop" : "Web",
        version: info.version,
        context: info.context,
        checkProtocolTask: null, // disable check, allow file:// URLs
      },
    });
  }, [info]);
};

export default function Analytics({ fragment }: { fragment: NavGA$key }) {
  const info = useFragment(
    graphql`
      fragment NavGA on Query {
        context
        dev
        doNotTrack
        uid
        version
      }
    `,
    fragment
  );

  const [_, setAnalyticsInfo] = useAnalyticsInfo();
  useEffect(() => {
    const buildType = info.dev ? "dev" : "prod";
    const writeKey = DEFAULT_WRITE_KEYS[buildType];
    setAnalyticsInfo({
      userId: info.uid,
      userGroup: "fiftyone-oss",
      writeKey,
      doNotTrack: info.doNotTrack,
      debug: info.dev,
    });
  }, [info, setAnalyticsInfo]);
  useGA(info);

  return <AnalyticsConsent />;
}
