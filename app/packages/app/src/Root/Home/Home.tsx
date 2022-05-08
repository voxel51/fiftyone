import { Loading, Route } from "@fiftyone/components";
import React, { useLayoutEffect } from "react";
import { useSetRecoilState } from "recoil";
import { dataset } from "../../recoil/atoms";

const Home: Route = ({}) => {
  const setDataset = useSetRecoilState(dataset);
  useLayoutEffect(() => {
    setDataset(null);
  }, []);
  return <Loading>No dataset selected</Loading>;
};

export default Home;
