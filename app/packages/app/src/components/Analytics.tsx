import { isElectron } from "@fiftyone/utilities";
import React, { useCallback } from "react";
import ReactGA from "react-ga4";
import { graphql, useFragment } from "react-relay";
import gaConfig from "../ga";
import AnalyticsConsent from "./AnalyticsConsent";
import type { NavGA$data, NavGA$key } from "./__generated__/NavGA.graphql";

const useCallGA = (info: NavGA$data) => {
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
  const callGA = useCallGA(info);

  return <AnalyticsConsent callGa={callGA} info={info} />;
}
