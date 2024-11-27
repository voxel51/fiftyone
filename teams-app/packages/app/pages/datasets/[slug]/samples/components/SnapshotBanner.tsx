import { useLazyLoadLatestQuery } from "@fiftyone/hooks";
import {
  Box,
  Button,
  Container,
  PopoverButton,
  TableSkeleton,
  Timestamp,
} from "@fiftyone/teams-components";
import {
  SNAPSHOT_BANNER_QUERY_CACHE_KEY,
  historySnapshotQuery$dataT,
  historySnapshotQueryT,
  historySnapshotsConnectionQuery,
  historySnapshotsConnectionQueryT,
} from "@fiftyone/teams-state";
import {
  AccessTime,
  ArrowCircleLeftOutlined,
  ExpandMore,
} from "@mui/icons-material";
import {
  Grid,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { Fragment, Suspense, useCallback, useState } from "react";
import { SnapshotSummary } from "../../history/components/Snapshot";
import {
  SnapshotActionsMenu,
  SnapshotActionsModals,
} from "../../history/components/SnapshotActions";
import { getHistoryState, pushHistoryState } from "../dynamicRouting/state";
export default function SnapshotBanner({
  snapshotData: { dataset },
}: {
  snapshotData: historySnapshotQueryT["response"];
}) {
  if (!dataset?.snapshot) {
    throw new Error("no snapshot");
  }
  const { name, id, createdAt, createdBy, loadStatus } = dataset.snapshot;

  const handleBackToLatest = useCallback(() => {
    const state = getHistoryState();
    pushHistoryState({
      datasetId: state.datasetId,
      datasetName: state.datasetName,
      datasetSlug: state.datasetSlug,
      view: [],
    });
  }, []);

  return (
    <Container data-cy={"snapshot-banner"}>
      <Grid container alignItems="center" spacing={2}>
        <Grid item xs>
          <Stack direction="row" spacing={1}>
            <AccessTime
              sx={{
                color: (theme) => theme.palette.text.secondary,
                my: 0.5,
                fontSize: 20,
              }}
            />
            <Box>
              <Typography variant="body2" pl={0.5}>
                {name}
              </Typography>
              <PopoverButton
                PopoverButtonBody={() => (
                  <Stack
                    direction="row"
                    spacing={1}
                    divider={<Typography>&middot;</Typography>}
                    alignItems="center"
                  >
                    <Typography>{createdBy?.name}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Timestamp timestamp={createdAt} />
                      <ExpandMore
                        sx={{ color: (theme) => theme.palette.text.secondary }}
                      />
                    </Stack>
                  </Stack>
                )}
                popoverButtonProps={{
                  variant: "text",
                  sx: { py: 0.25, px: 0.5 },
                }}
                PopoverBody={() => (
                  <Box maxHeight="60vh" maxWidth="50vw">
                    <Suspense
                      fallback={
                        <TableSkeleton
                          skeletonProps={{
                            height: 48,
                            width: 512,
                            sx: { mx: 2 },
                          }}
                        />
                      }
                    >
                      <SnapshotsSummary snapshotId={id} />
                    </Suspense>
                  </Box>
                )}
                popoverProps={{
                  anchorOrigin: { vertical: "bottom", horizontal: "right" },
                }}
              />
            </Box>
          </Stack>
        </Grid>
        <Grid item xs>
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            justifyContent="flex-end"
          >
            <Typography color="text.tertiary">
              This is an older snapshot of this dataset
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArrowCircleLeftOutlined />}
              onClick={handleBackToLatest}
            >
              Back to the latest version
            </Button>
            <SnapshotActionsMenu
              name={name}
              id={id}
              createdAt={createdAt}
              createdBy={createdBy}
              loadStatus={loadStatus}
              onArchive={handleBackToLatest}
            />
          </Stack>
        </Grid>
      </Grid>
      <SnapshotActionsModals
        onDelete={handleBackToLatest}
        onRollback={handleBackToLatest}
      />
    </Container>
  );
}

function SnapshotsSummary(props: SnapshotsSummaryPropsType) {
  const { snapshotId } = props;
  const { query } = useRouter();
  const data = useLazyLoadLatestQuery<historySnapshotsConnectionQueryT>(
    historySnapshotsConnectionQuery,
    { identifier: query.slug as string, first: 25 },
    { cacheKey: SNAPSHOT_BANNER_QUERY_CACHE_KEY }
  );
  const snapshots = data.dataset?.snapshots;
  if (!Array.isArray(snapshots)) return null;

  return (
    <List>
      {snapshots.map((snapshot, i) => {
        return (
          <CompactSnapshot
            key={snapshot.id}
            snapshot={snapshot}
            noBorder={i === snapshots.length - 1}
            selected={snapshotId === snapshot.id}
          />
        );
      })}
    </List>
  );
}

function CompactSnapshot(props: CompactSnapshotPropsType) {
  const { snapshot, selected, noBorder } = props;
  const [hovered, setHovered] = useState(false);
  const { query, pathname } = useRouter();
  const isLoaded = snapshot.loadStatus === "LOADED";
  const ListItemComponent =
    selected || !isLoaded ? ListItemText : ListItemButton;
  const listItemComponentProps =
    selected || !isLoaded ? { sx: { px: 2, py: 1 } } : {};
  const ListParentComponent = selected || !isLoaded ? Fragment : NextLink;
  const listParentComponentProps = selected
    ? {}
    : {
        href: { pathname, query: { ...query, snapshot: snapshot.name } },
      };
  return (
    <ListParentComponent {...listParentComponentProps}>
      <ListItem
        disablePadding
        sx={{
          borderBottom: noBorder
            ? "unset"
            : (theme) => `1px solid ${theme.palette.divider}`,
          backgroundColor: selected
            ? (theme) => theme.palette.action.hover
            : "unset",
        }}
        onMouseEnter={() => {
          setHovered(true);
        }}
        onMouseLeave={() => {
          setHovered(false);
        }}
      >
        <ListItemComponent {...listItemComponentProps}>
          <Stack>
            <SnapshotSummary {...snapshot} />
            {!isLoaded && hovered && (
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  display: "flex",
                  alignItems: "center",
                  px: 2,
                  background: (theme) => theme.palette.background.overlay,
                  height: "100%",
                  width: "100%",
                }}
              >
                <Typography color="text.tertiary">
                  Cannot browse archived snapshot.&nbsp;
                  <NextLink href={`/datasets/${query.slug}/history`} passHref>
                    <Link color="secondary">Manage snapshots</Link>
                  </NextLink>
                </Typography>
              </Box>
            )}
          </Stack>
        </ListItemComponent>
      </ListItem>
    </ListParentComponent>
  );
}

type SnapshotsSummaryPropsType = {
  snapshotId: string;
};

type CompactSnapshotPropsType = {
  snapshot: historySnapshotQuery$dataT["dataset"]["snapshot"];
  selected?: boolean;
  noBorder?: boolean;
};
