import { useRouter } from "next/router";
import { useFragment } from "react-relay";

import { DatasetFragment } from "@fiftyone/teams-state";

import { useHandleDatasetPinChanged } from "@fiftyone/hooks";

import { PinIcon } from "@fiftyone/teams-components";
import {
  IconButton,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import { DatasetFrag$key } from "queries/__generated__/DatasetFrag.graphql";
import { formatNumber } from "@fiftyone/teams-utilities";
type Props = {
  ds: DatasetFrag$key;
};
export const PinnedDatasetRow = (props: Props) => {
  const data = useFragment(DatasetFragment, props.ds);

  const {
    name,
    slug,
    samplesCount,
    viewer: { pinned },
  } = data;
  const { push } = useRouter();
  const { toggleDatasetPin } = useHandleDatasetPinChanged({
    slug,
    currentlyPinned: pinned,
    row: data,
  });

  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Tooltip title="Unpin dataset">
          <IconButton onClick={toggleDatasetPin}>
            <PinIcon />
          </IconButton>
        </Tooltip>
      }
      key={slug}
      sx={{
        paddingLeft: 0,
        paddingRight: 0,
      }}
      data-testid={`pinned-dataset-${name}`}
    >
      <ListItemButton
        onClick={() => {
          push(`/datasets/${slug}/samples`);
        }}
        sx={{ borderRadius: 1 }}
      >
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
            {name}
          </Typography>
          <Typography variant="body1">{`${formatNumber(samplesCount)} ${
            !!samplesCount && samplesCount === 1 ? "sample" : "samples"
          }`}</Typography>
        </ListItemText>
      </ListItemButton>
    </ListItem>
  );
};
