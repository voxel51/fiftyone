import { NotFoundError, toCamelCase } from "@fiftyone/utilities";
import React, { useContext, useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";

import DatasetComponent from "../../components/Dataset";

import * as fos from "@fiftyone/state";
import { refresher, Route, RouterContext } from "@fiftyone/state";
import { getDatasetName } from "@fiftyone/state";
import { usePreLoadedDataset, DatasetQuery } from "../../loaders";

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const router = useContext(RouterContext);
  const dataset = usePreLoadedDataset(prepared, router?.state);
  if (!dataset) {
    throw new NotFoundError(`/datasets/${getDatasetName(router)}`);
  }
  const name = useRecoilValue(fos.datasetName);
  if (!name || name !== dataset.name) {
    return null;
  }

  return <DatasetComponent />;
};

export default Dataset;
