import { NotFoundError } from "@fiftyone/utilities";
import React, { useContext } from "react";
import { useRecoilValue } from "recoil";

import DatasetComponent from "../../components/Dataset";

import * as fos from "@fiftyone/state";
import { Route, RouterContext } from "@fiftyone/state";
import { getDatasetName } from "@fiftyone/state";
import { DatasetQuery } from "../../__generated__/DatasetQuery.graphql";
import { usePreLoadedDataset } from "../../Dataset";

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const router = useContext(RouterContext);
  const [dataset, ready] = usePreLoadedDataset(prepared);
  const name = useRecoilValue(fos.datasetName);
  if (!ready) return null;
  if (dataset === null) {
    throw new NotFoundError(`/datasets/${getDatasetName(router)}`);
  }
  if (!name || name !== dataset.name) {
    return null;
  }

  return <DatasetComponent />;
};

export default Dataset;
