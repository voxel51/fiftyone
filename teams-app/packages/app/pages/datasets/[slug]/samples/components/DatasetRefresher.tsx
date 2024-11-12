import { useRefresh } from "@fiftyone/state";
import { pendingDatasetRefresh } from "@fiftyone/teams-state";
import { useEffect } from "react";
import { useRecoilState } from "recoil";

export default function DatasetRefresher() {
  const [pending, setPending] = useRecoilState(pendingDatasetRefresh);
  const refreshDataset = useRefresh();

  useEffect(() => {
    if (pending) refreshDataset();
    setPending(false);
  }, [pending, refreshDataset, setPending]);

  return null;
}
