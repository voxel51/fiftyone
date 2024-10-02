import { useCurrentOrganization } from "@fiftyone/hooks";
import { Box } from "@fiftyone/teams-components";
import { Typography } from "@mui/material";

type GrantDatasetAccessTitleProps = {
  isGroup: boolean;
};

export default function GrantDatasetAccessTitle(
  props: GrantDatasetAccessTitleProps
) {
  const { displayName } = useCurrentOrganization();
  const { isGroup } = props;
  const baseText = `You can grant access to any existing group at ${displayName}.`;
  const text = `${baseText}${
    isGroup
      ? ""
      : " Or you can invite new users to view/edit the dataset by email."
  }`;

  return (
    <Box sx={{ pb: 2 }}>
      <Typography variant="h6">
        Grant {props.isGroup ? "group" : "people"} access to dataset
      </Typography>
      <Typography>{text}</Typography>
    </Box>
  );
}
