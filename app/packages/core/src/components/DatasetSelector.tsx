import { Link, Selector } from "@fiftyone/components";
import {
  datasetHeadName,
  datasetName,
  datasetSnapshotName,
  getDatasetName,
  RouterContext,
  useSetDataset,
} from "@fiftyone/state";
import React, { useContext, useMemo } from "react";
import { useRecoilValue } from "recoil";

const DatasetLink: React.FC<{ value: string; className: string }> = ({
  className,
  value,
}) => {
  return (
    <Link title={value} className={className}>
      {value}
    </Link>
  );
};

const DatasetSelector: React.FC<{
  useSearch: React.ComponentProps<typeof Selector>["useSearch"];
}> = ({ useSearch }) => {
  const setDataset = useSetDataset();
  const dataset = useRecoilValue(datasetName);
  const datasetHead = useRecoilValue(datasetHeadName);
  const datasetSnapshot = useRecoilValue(datasetSnapshotName);
  const context = useContext(RouterContext);

  const nameWithSnapshot = useMemo(() => {
    if (datasetHead && datasetSnapshot) {
      return `${datasetHead} (${datasetSnapshot})`;
    }
  }, [datasetHead, datasetSnapshot]);

  return (
    <Selector<string>
      component={DatasetLink}
      placeholder={"Select dataset"}
      inputStyle={{ height: 40, maxWidth: 300 }}
      containerStyle={{ position: "relative" }}
      onSelect={(name) => {
        name !== dataset && setDataset(name);
      }}
      overflow={true}
      useSearch={useSearch}
      value={nameWithSnapshot || getDatasetName(context) || ""}
    />
  );
};

export default DatasetSelector;
