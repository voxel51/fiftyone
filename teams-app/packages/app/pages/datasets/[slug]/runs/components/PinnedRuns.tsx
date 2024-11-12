import { useCurrentDataset } from "@fiftyone/hooks";
import {
  Box,
  DatasetHighlightsWidget,
  Timestamp,
} from "@fiftyone/teams-components";
import { Dataset, runsPageQuery, runsPageQueryT } from "@fiftyone/teams-state";
import { INITIAL_PINNED_RUNS_LIMIT } from "@fiftyone/teams-state/src/constants";
import { Button } from "@mui/material";
import { useRouter } from "next/router";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePreloadedQuery, useQueryLoader } from "react-relay";
import getTimestamp from "../utils/getTimestamp";
import useRefresher, { PINNED_RUNS_REFRESHER_ID } from "../utils/useRefresher";
import RunStatus from "./RunStatus";
import RunsPin from "./RunsPin";

function PinnedRunsWithQuery(props) {
  const { queryRef, pageSize, setPageSize } = props;
  const { asPath } = useRouter();
  const result = usePreloadedQuery<runsPageQueryT>(runsPageQuery, queryRef);
  const { nodeTotal, nodes } = result.delegatedOperationsPage;

  const items = nodes.map((run) => {
    const { id, label, runBy, runState, operator } = run;
    const timestamp = getTimestamp(run);
    const runByName = runBy?.name;
    return {
      title: label || operator,
      subtitle: [
        <Timestamp key={id + "-timestamp"} timestamp={timestamp} />,
        ...(runByName ? [runByName] : []),
      ],
      Icon: <RunStatus status={runState} variant="circle" />,
      SecondaryAction: <RunsPin id={id} pinned isHovering />,
      link: `${asPath}/${id}`,
    };
  });
  const leftoverPinnedRuns = nodeTotal - pageSize;

  return (
    <Box>
      <DatasetHighlightsWidget
        title="Pinned runs"
        items={items}
        emptyTitle="No pinned runs yet"
      />
      {leftoverPinnedRuns > 0 && (
        <Button
          size="small"
          color="secondary"
          sx={{ ml: 1 }}
          onClick={() => {
            setPageSize(nodeTotal);
          }}
        >
          +{leftoverPinnedRuns} more
        </Button>
      )}
    </Box>
  );
}

export default function PinnedRuns() {
  const [queryRef, loadQuery] = useQueryLoader<runsPageQueryT>(runsPageQuery);
  const dataset = useCurrentDataset() as Dataset;
  const [pageSize, setPageSize] = useState(INITIAL_PINNED_RUNS_LIMIT);
  const { id } = dataset;

  const loadQueryOptions = useMemo(
    () => ({
      filter: { datasetIdentifier: { eq: id }, pinned: true },
      page: 1,
      pageSize,
    }),
    [id, pageSize]
  );

  useEffect(() => {
    loadQuery(loadQueryOptions);
  }, [loadQuery, loadQueryOptions]);

  const refresh = useCallback(() => {
    loadQuery(loadQueryOptions, { fetchPolicy: "store-and-network" });
  }, [loadQuery, loadQueryOptions]);

  const [refresher, setRefresher] = useRefresher(PINNED_RUNS_REFRESHER_ID);
  setRefresher(refresh);

  if (!queryRef) return <PinnedRunsSkeleton />;

  return (
    <Suspense fallback={<PinnedRunsSkeleton />}>
      <PinnedRunsWithQuery
        queryRef={queryRef}
        setPageSize={(pageSize: number) => {
          setPageSize(pageSize);
        }}
        pageSize={pageSize}
      />
    </Suspense>
  );
}

function PinnedRunsSkeleton() {
  return <DatasetHighlightsWidget items={[]} title="Pinned runs" loading />;
}
