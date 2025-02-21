import { TableSkeleton } from "@fiftyone/teams-components";
import { runsLogQuery } from "@fiftyone/teams-state";
import { Suspense, useCallback } from "react";
import { usePreloadedQuery, useQueryLoader } from "react-relay";

export default function LogPreview(props) {
  const result = usePreloadedQuery(runsLogQuery, props.queryRef);
  console.log("result", result);

  return (
    <Suspense fallback={<TableSkeleton rows={25} />}>
      <div>this is a table</div>
    </Suspense>
  );
}
