import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { useCallback, useMemo } from "react";
import { loadQuery, useRelayEnvironment } from "react-relay";
import { useRecoilValue } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { NonNestedDynamicGroup } from "./NonNestedGroup";

export const DynamicGroup = () => {
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const environment = useRelayEnvironment();
  const dataset = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.dynamicGroupViewQuery);
  const dynamicGroupIndex = useRecoilValue(fos.dynamicGroupIndex);
  const slice = useRecoilValue(fos.groupSlice);

  const loadDynamicGroupSamples = useCallback(
    (cursor?: number) => {
      if (!dataset) {
        throw new Error("No dataset");
      }

      return loadQuery<foq.paginateSamplesQuery>(
        environment,
        foq.paginateSamples,
        {
          after: cursor ? String(cursor) : null,
          dataset,
          filter: {
            group: {
              slice,
            },
          },
          view,
        }
      );
    },
    [dataset, environment, slice, view]
  );

  const queryRef = useMemo(
    () => loadDynamicGroupSamples(dynamicGroupIndex),
    [loadDynamicGroupSamples, dynamicGroupIndex]
  );

  return (
    <>
      {hasGroupSlices ? (
        <NestedGroup queryRef={queryRef} />
      ) : (
        <NonNestedDynamicGroup queryRef={queryRef} />
      )}
    </>
  );
};
