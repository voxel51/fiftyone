import { currentDatasetState } from "@fiftyone/teams-state";
import { useRouter } from "next/router";
import { useRecoilValue } from "recoil";

export function useCurrentDataset() {
  const route = useRouter();
  return useRecoilValue(currentDatasetState(route.query.slug as string));
}
