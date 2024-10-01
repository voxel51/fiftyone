import { useMutation } from "@fiftyone/hooks";
import { Box, ColorCircle, Timestamp } from "@fiftyone/teams-components";
import {
  RecentView as RecentViewType,
  RecentViewsListFragment$dataT,
  updateDatasetViewLastLoadedAtMutation,
} from "@fiftyone/teams-state";
import {
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { graphql } from "react-relay/hooks";

export const RECENT_VIEWS_DEFAULT_LIMIT = 5;
export const RecentViewsListFragment = graphql`
  fragment RecentViewsListFragment on Query
  @refetchable(queryName: "RecentViewsListFragmentQuery") {
    userViews(first: $firstViews) {
      view {
        id
        name
        slug
        color
        createdAt
      }
      lastLoadedAt
      loadCount
      dataset {
        id
        name
        slug
      }
    }
  }
`;

interface Props {
  userViews: RecentViewsListFragment$dataT["userViews"];
}

export default function RecentViews(props: Props) {
  const { userViews = [] } = props;

  if (!userViews) {
    return null;
  }

  return (
    <Box pt={2}>
      <Typography variant="body2" fontWeight="semiBold" paddingBottom={2}>
        Your recent views
      </Typography>
      <Divider />
      {userViews && userViews.length === 0 && (
        <Typography variant="body1" fontWeight="medium" paddingTop={2}>
          No recent views
        </Typography>
      )}
      <List dense={true}>
        {userViews
          .filter(
            ({ view, dataset }) =>
              view && dataset?.id && view.name && view.slug && view.id
          )
          .map((userView, index) => (
            <RecentView key={index} {...userView} />
          ))}
      </List>
    </Box>
  );
}

// Component has some overlap with pinned dataset row
function RecentView({ view, lastLoadedAt, dataset }: RecentViewType) {
  const { push } = useRouter();
  const [updateDatasetViewLastLoadedAt] = useMutation(
    updateDatasetViewLastLoadedAtMutation
  );

  return (
    <Tooltip title={view.name} key={view.slug} placement="left">
      <ListItem disablePadding sx={{ paddingX: 0 }}>
        <ListItemButton
          onClick={() => {
            updateDatasetViewLastLoadedAt({
              variables: {
                viewName: view.name,
                viewId: view.id,
                datasetId: dataset.id,
              },
              onCompleted(data) {
                push(`/datasets/${dataset.slug}/samples?view=${view.slug}`);
              },
              onError(error) {
                console.error(error);
              },
            });
          }}
          sx={{ borderRadius: 1, padding: 0 }}
        >
          <ListItemIcon sx={{ minWidth: "auto", pr: 2, pl: 0 }}>
            <ColorCircle color={view.color} style={{ marginLeft: 4 }} />
          </ListItemIcon>
          <ListItemText>
            <Typography
              variant="body2"
              fontWeight="medium"
              sx={{
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {view.name}
            </Typography>
            <Box display="flex" flexDirection="row">
              <Typography variant="body1" noWrap>
                {dataset.name}
              </Typography>
              <Typography variant="body1" noWrap>
                &#160;&#x2022;&#160; <Timestamp timestamp={lastLoadedAt} />
              </Typography>
            </Box>
          </ListItemText>
        </ListItemButton>
      </ListItem>
    </Tooltip>
  );
}
