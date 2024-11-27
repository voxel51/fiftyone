import { useCurrentDataset } from "@fiftyone/hooks";
import { DatasetHighlightsWidget, Timestamp } from "@fiftyone/teams-components";
import {
  Dataset,
  runsPageQuery,
  runsPageQueryDefaultVariables,
  runsPageQueryT,
} from "@fiftyone/teams-state";
import { useRouter } from "next/router";
import { Suspense, useEffect } from "react";
import { usePreloadedQuery, useQueryLoader } from "react-relay";
import getTimestamp from "../utils/getTimestamp";
import RunStatus from "./RunStatus";

function RecentRunsWithQuery(props) {
  const { queryRef } = props;
  const { asPath } = useRouter();
  const result = usePreloadedQuery<runsPageQueryT>(runsPageQuery, queryRef);
  const { nodes } = result.delegatedOperationsPage;
  const recentRuns = nodes.slice(0, 5);

  const items = recentRuns.map((run) => {
    const { id, label, runState, runBy, operator } = run;
    const timestamp = getTimestamp(run);
    const runByName = runBy?.name;
    return {
      title: label || operator,
      subtitle: [
        <Timestamp key={id + "-timestamp"} timestamp={timestamp} />,
        ...(runByName ? [runByName] : []),
      ],
      Icon: <RunStatus status={runState} variant="circle" />,
      link: `${asPath}/${id}`,
    };
  });

  return (
    <DatasetHighlightsWidget
      title="Recent runs"
      items={items}
      emptyTitle="No recent runs yet"
    />
  );
}

export default function RecentRuns() {
  const [queryRef, loadQuery] = useQueryLoader(runsPageQuery);
  const dataset = useCurrentDataset() as Dataset;
  const { id } = dataset;

  useEffect(() => {
    loadQuery({
      ...runsPageQueryDefaultVariables,
      filter: { datasetIdentifier: { eq: id } },
    });
  }, [id, loadQuery]);

  if (!queryRef) return <RecentRunsSkeleton />;

  return (
    <Suspense fallback={<RecentRunsSkeleton />}>
      <RecentRunsWithQuery queryRef={queryRef} />
    </Suspense>
  );
}

function RecentRunsSkeleton() {
  return <DatasetHighlightsWidget items={[]} title="Recent runs" loading />;
}
