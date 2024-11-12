import { useCurrentOrganization } from "@fiftyone/hooks";
import { Box } from "@fiftyone/teams-components";
import { currentUserGroup } from "@fiftyone/teams-state";
import { Typography } from "@mui/material";
import { useRecoilValue } from "recoil";

export default function MultiUserSearchSelectModalTitle() {
  const organization = useCurrentOrganization();
  const organizationDisplayName = organization?.displayName;
  const group = useRecoilValue(currentUserGroup);
  const groupName = group?.name || "";

  return (
    <Box sx={{ pb: 2, width: "95%" }}>
      <Box display="flex">
        <Typography variant="h6" noWrap>
          Add users to group {groupName}
        </Typography>
      </Box>
      <Typography noWrap>
        You can add any existing user at {organizationDisplayName} to group{" "}
        {groupName}. <br />
      </Typography>
    </Box>
  );
}
