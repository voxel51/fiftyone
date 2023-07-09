import * as fos from "@fiftyone/state";
import { NotFoundError } from "@fiftyone/utilities";
import React, { useContext } from "react";
import { usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import {
  DatasetNodeQuery,
  DatasetQueryRef,
  usePreLoadedDataset,
} from "../../Dataset";
import { DatasetQuery } from "../../__generated__/DatasetQuery.graphql";
import DatasetComponent from "../../components/Dataset";

export const Dataset: fos.Route<DatasetQuery> = ({ prepared }) => {
  const router = useContext(fos.RouterContext);
  const [dataset, ready] = usePreLoadedDataset(prepared);
  const queryRef = usePreloadedQuery<DatasetQuery>(DatasetNodeQuery, prepared);
  const name = useRecoilValue(fos.datasetName);

  if (!ready) return null;
  if (dataset === null) {
    throw new NotFoundError({
      path: `/datasets/${fos.getDatasetName(router)}`,
    });
  }
  if (!name || name !== dataset.name) {
    return null;
  }

  return (
    <DatasetQueryRef.Provider value={queryRef}>
      <DatasetComponent />
    </DatasetQueryRef.Provider>
  );
};

export default Dataset;
