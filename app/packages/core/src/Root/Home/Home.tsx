import { Loading, Route } from "@fiftyone/components";
import React, { useLayoutEffect } from "react";
import { useSetRecoilState } from "recoil";

import * as fos from "@fiftyone/state";

const Home: Route = ({}) => {
  const setDataset = useSetRecoilState(fos.dataset);
  useLayoutEffect(() => {
    setDataset(null);
  }, []);
  return <Loading>No dataset selected</Loading>;
};

export default Home;
