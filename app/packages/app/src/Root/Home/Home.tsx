import { Loading, Route } from "@fiftyone/components";
import React, { useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";
import { useResetRecoilState } from "recoil";

import { HomeQuery } from "./__generated__/HomeQuery.graphql";
import { stateDescription } from "@fiftyone/app/src/recoil/atoms";

const Home: Route<HomeQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query HomeQuery {
        version
      }
    `,
    prepared
  );
  const reset = useResetRecoilState(stateDescription);

  useEffect(() => {
    reset();
  }, []);

  return <Loading>No dataset selected</Loading>;
};

export default Home;
