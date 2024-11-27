import {
  datasetSearchTermState,
  searchInputState,
  searchTermState,
} from "@fiftyone/teams-state";
import { useSetRecoilState } from "recoil";

export default function useResetDatasetsSearch() {
  const setSearchTerm = useSetRecoilState(searchTermState);
  const setSearchInput = useSetRecoilState(searchInputState);
  const setDatasetSearchTerm = useSetRecoilState(datasetSearchTermState);

  return () => {
    setSearchTerm("");
    setSearchInput("");
    setDatasetSearchTerm(null);
  };
}
