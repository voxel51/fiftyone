import React, { useCallback } from "react";
import ReactGA from "react-ga4";
import { graphql, useFragment } from "react-relay";
import gaConfig from "../ga";
import AnalyticsConsent from "./AnalyticsConsent";
import type {
  Analytics$data,
  Analytics$key,
} from "./__generated__/Analytics.graphql";

const useCallGA = (info: Analytics$data) => {
  return useCallback(() => {
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
        version: info.version,
        context: info.context,
        checkProtocolTask: null, // disable check, allow file:// URLs
      },
    });
  }, [info]);
};

export default function Analytics({ fragment }: { fragment: Analytics$key }) {
  const info = useFragment(
    graphql`
      fragment Analytics on Query {
        context
        dev
        doNotTrack
        uid
        version
      }
    `,
    fragment
  );
  const callGA = useCallGA(info);

  // NOTE: this is a one-off case where we disable the component in playwright
  // so that this banner doesn't interfere with the tests.
  // waiting for analytics to show up before we can dismiss it is a pain
  // and adds significant time to the tests.
  // we should usually _never_ have any divergence between tests and prod.
  if (window["IS_PLAYWRIGHT"]) {
    console.log("Analytics component is disabled in playwright"); 
    return null;
  }

  return <AnalyticsConsent callGA={callGA} info={info} />;
}
