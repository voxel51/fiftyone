import { TableSkeleton } from "@fiftyone/teams-components";
import { runsLogQuery } from "@fiftyone/teams-state";
import { Suspense, useCallback } from "react";
import { usePreloadedQuery, useQueryLoader } from "react-relay";

export default function LogPreview(props) {
  console.log("queryRef before passing to Logs:", props.queryRef);
  if (!props.queryRef) {
    return <TableSkeleton rows={25} />;
  }

  try {
    const result = usePreloadedQuery(runsLogQuery, props.queryRef);
    console.log("Fetched Logs:", result);
  } catch (error) {
    console.error("Error fetching logs:", error);
  }

  return (
    <Suspense fallback={<TableSkeleton rows={25} />}>
      <div>this is a table</div>
    </Suspense>
  );
}
