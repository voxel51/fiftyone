import * as fos from "@fiftyone/state";
import { NotFoundError } from "@fiftyone/utilities";
import React, { useContext, useEffect } from "react";
import { usePreloadedQuery } from "react-relay";
import { useRecoilValue, useSetRecoilState } from "recoil";
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
  const setReadOnly = useSetRecoilState(fos.readOnly);
  const setCanChangeSavedViews = useSetRecoilState(fos.canEditSavedViews);
  const setCanChangeCustomColors = useSetRecoilState(fos.canEditCustomColors);

  useEffect(() => {
    const readOnly = Boolean(dataset?.headName && dataset?.snapshotName);
    setReadOnly(readOnly);
    setCanChangeSavedViews(!readOnly);
    setCanChangeCustomColors(!readOnly);
  }, [dataset, setReadOnly, setCanChangeSavedViews, setCanChangeCustomColors]);

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
