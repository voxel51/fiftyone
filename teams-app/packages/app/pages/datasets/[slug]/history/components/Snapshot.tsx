import { IconButton } from "@fiftyone/components";
import {
  useCacheStore,
  useCurrentDataset,
  useCurrentDatasetPermission,
  useMutation,
} from "@fiftyone/hooks";
import {
  Box,
  Button,
  CopyButton,
  Timestamp,
  UserCard,
} from "@fiftyone/teams-components";
import {
  Dataset,
  historyLoadDatasetSnapshotMutation,
  SNAPSHOT_BANNER_QUERY_CACHE_KEY,
  UNARCHIVE_DATASET_SNAPSHOT,
} from "@fiftyone/teams-state";
import { parentPath } from "@fiftyone/teams-utilities";
import {
  MoreHoriz,
  UnarchiveOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import {
  TimelineConnector,
  TimelineContent,
  TimelineItem,
  TimelineSeparator,
} from "@mui/lab";
import { CircularProgress, Grid, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useLayoutEffect, useRef, useState } from "react";
import { SnapshotActionsMenu } from "./SnapshotActions";
import SnapshotStats from "./SnapshotStats";

export default function Snapshot(props: SnapshotProps) {
  const { pathname, query, push } = useRouter();
  const { name, id, last, refresh, createdAt, createdBy, loadStatus } = props;
  const [archiving, setArchiving] = useState(false);
  const [load, loading] = useMutation(historyLoadDatasetSnapshotMutation);
  const { name: datasetIdentifier } = useCurrentDataset() as Dataset;
  const [_, setStale] = useCacheStore(SNAPSHOT_BANNER_QUERY_CACHE_KEY);
  const canUnarchive = useCurrentDatasetPermission([
    UNARCHIVE_DATASET_SNAPSHOT,
  ]);

  const isLoaded = loadStatus === "LOADED" && !archiving;
  const isLoading = loadStatus === "LOADING" || loading;
  const isUnloaded = loadStatus === "UNLOADED";
  const isUnloading = archiving;
  const showUnarchive = isUnloaded && !isLoading;

  return (
    <TimelineItem>
      <TimelineSeparator>
        <AccessTimeIcon
          sx={{
            color: (theme) => theme.palette.text.tertiary,
            my: 0.5,
            fontSize: 20,
          }}
        />
        {!last && (
          <TimelineConnector
            sx={{ bgcolor: (theme) => theme.palette.text.tertiary }}
          />
        )}
      </TimelineSeparator>
      <TimelineContent sx={{ pt: 0.25, pb: 2 }}>
        <Grid container sx={{ alignItems: "center" }} spacing={4}>
          <Grid item xs>
            <SnapshotSummary {...props} />
          </Grid>
          <Grid item>
            <Stack spacing={1} direction="row">
              <CopyButton text={name} size="small" />
              {isLoaded && (
                <Button
                  startIcon={<VisibilityOutlined />}
                  size="small"
                  onClick={() => {
                    push({
                      pathname: parentPath(pathname) + "/samples",
                      query: { ...query, snapshot: name },
                    });
                  }}
                >
                  Browse
                </Button>
              )}
              {showUnarchive && (
                <Box
                  title={
                    !canUnarchive
                      ? "You do not have permission to unarchive snapshot"
                      : undefined
                  }
                  sx={{ cursor: !canUnarchive ? "not-allowed" : undefined }}
                >
                  <Button
                    startIcon={<UnarchiveOutlined />}
                    size="small"
                    disabled={!canUnarchive}
                    onClick={() => {
                      load({
                        variables: { datasetIdentifier, snapshotName: name },
                        successMessage:
                          "Successfully unarchived snapshot " + name,
                        onSuccess() {
                          setStale(true);
                          if (refresh) refresh();
                        },
                      });
                    }}
                  >
                    Unarchive
                  </Button>
                </Box>
              )}
              {(isLoading || isUnloading) && (
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" fontSize={14}>
                    {isLoading ? "Unarchiving" : "Archiving"}
                  </Typography>
                </Stack>
              )}
              <SnapshotActionsMenu
                id={id}
                name={name}
                refresh={refresh}
                createdAt={createdAt}
                createdBy={createdBy}
                loadStatus={loadStatus}
                onArchive={(state) => {
                  setArchiving(state === "loading");
                }}
              />
            </Stack>
          </Grid>
        </Grid>
      </TimelineContent>
    </TimelineItem>
  );
}

export function SnapshotSummary(props: SnapshotSummaryProps) {
  const { name, description, linearChangeSummary, createdAt, createdBy } =
    props;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2">{name}</Typography>
        <Timestamp timestamp={createdAt} />
      </Stack>
      {linearChangeSummary ? (
        <SnapshotStats {...linearChangeSummary} singleLine />
      ) : (
        <Typography color="text.tertiary">
          Changes summary is unavailable
        </Typography>
      )}
      <SnapshotDescription content={description} />
      {createdBy && (
        <Box pt={0.25}>
          <UserCard
            name={createdBy?.name}
            src={createdBy?.picture || ""}
            color="secondary"
            detailed
            compact
          />
        </Box>
      )}
    </Box>
  );
}

function SnapshotDescription(props) {
  const { content } = props;
  const elem = useRef<HTMLParagraphElement>(null);
  const [width, setWidth] = useState(80);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (elem.current) {
      setWidth(elem.current.offsetWidth);
    }
  }, []);

  if (typeof content !== "string") return null;
  const [firstLine] = content.split("\n");
  const characterToShow = Math.floor(width / AVERAGE_CHARACTER_WIDTH);
  const canOverflow = firstLine.length > characterToShow;
  const previewTextPattern = new RegExp(`^.{${characterToShow}}\\w*`);
  const previewText = canOverflow
    ? firstLine.match(previewTextPattern)
    : firstLine;
  const showExpandIcon = canOverflow || content.includes("\n");

  return (
    <Typography pb={1} color="text.tertiary" whiteSpace="pre-line" ref={elem}>
      {!expanded && previewText}
      {expanded && content}
      {showExpandIcon && (
        <IconButton
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          title={`Show ${expanded ? "less" : "more"}`}
          sx={{
            ml: 1,
            backgroundColor: (theme) => theme.palette.background.secondary,
            borderRadius: 1,
            height: 14,
          }}
        >
          <MoreHoriz />
        </IconButton>
      )}
    </Typography>
  );
}

const AVERAGE_CHARACTER_WIDTH = 7;

export type SnapshotSummaryProps = {
  name: string;
  description: string;
  id: string;
  numSamples: number;
  createdAt: number;
  createdBy?: {
    name: string;
    picture?: string;
  };
  linearChangeSummary: {
    numSamplesAdded: number;
    numSamplesChanged: number;
    numSamplesDeleted: number;
  };
  loadStatus: "LOADED" | "LOADING" | "UNLOADED";
};

export type SnapshotProps = SnapshotSummaryProps & {
  last?: boolean;
  refresh?: () => void;
};
