import { useState } from "react";
import { useLazyLoadQuery, FetchPolicy } from "react-relay";
import {
  secretsUploadedQueryT,
  secretsUploadedQuery$dataT,
} from "@fiftyone/teams-state";
import { secretsUploadedQuery } from "@fiftyone/teams-state/src/Settings/secrets";

export default function useCurrentSecrets(
  fetchPolicy?: FetchPolicy
): [secretsUploadedQuery$dataT["secrets"], () => void] {
  const [fetchKey, setFetchKey] = useState(0);

  const currentSecrets = useLazyLoadQuery<secretsUploadedQueryT>(
    secretsUploadedQuery,
    {},
    { fetchPolicy, fetchKey }
  );

  function refetch() {
    setFetchKey(fetchKey + 1);
  }

  return [currentSecrets?.secrets, refetch];
}
