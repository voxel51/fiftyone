import { NotFoundError, toCamelCase } from "@fiftyone/utilities";
import React, { useContext, useEffect } from "react";
import { useRecoilValue } from "recoil";

import DatasetComponent from "../../components/Dataset";

import * as fos from "@fiftyone/state";
import { refresher, Route, RouterContext } from "@fiftyone/state";
import { getDatasetName } from "@fiftyone/state";
import { usePreLoadedDataset, DatasetQuery } from "../../loaders";

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const router = useContext(RouterContext);
  const [dataset, ready] = usePreLoadedDataset(prepared, router?.state);
  const name = useRecoilValue(fos.datasetName);
  if (!ready) return null;
  if (!dataset) {
    throw new NotFoundError(`/datasets/${getDatasetName(router)}`);
  }
  if (!name || name !== dataset.name) {
    return null;
  }

  return <DatasetComponent />;
};

export default Dataset;
