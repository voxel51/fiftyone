import { useCurrentOrganization, useUserDowngrade } from "@fiftyone/hooks";
import { Box } from "@fiftyone/teams-components";
import NotificationActivationIcon from "@mui/icons-material/NotificationsActive";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useTheme from "@mui/material/styles/useTheme";
import _ from "lodash";
import React from "react";

export const DowngradeUserCard: React.FC = () => {
  const theme = useTheme();
  const downgradeController = useUserDowngrade();
  const org = useCurrentOrganization();

  return (
    <div className="downgrade-user-card">
      <Typography variant="caption" sx={{ mb: 3 }}>
        You are about to downgrade{" "}
        {`${_.capitalize(_.toLower(downgradeController.userName ?? ""))}`} from{" "}
        <strong>{`${_.capitalize(
          _.toLower(downgradeController.currentRole)
        )}`}</strong>{" "}
        to{" "}
        <strong>{`${_.capitalize(
          _.toLower(downgradeController.newRole)
        )}`}</strong>
        .
      </Typography>

      <Box
        sx={{
          backgroundColor: theme.palette.text,
          borderRadius: 2,
          padding: 2,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <NotificationActivationIcon
            sx={{
              color: theme.palette.voxel["500"],
            }}
          />
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.voxel["500"],
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
            }}
          >
            Important notice
          </Typography>
        </Stack>

        <List dense sx={{ listStyleType: "disc", pl: 4 }}>
          <ListItem sx={{ display: "list-item", paddingLeft: 0 }}>
            <ListItemText
              primary={
                <Typography variant="subtitle1" component="span">
                  You have a{" "}
                  <Typography component="span" variant="body2">
                    {org.roleReupgradeGracePeriod}-minute grace period
                  </Typography>{" "}
                  to reverse this change
                </Typography>
              }
            />
          </ListItem>
          <ListItem sx={{ display: "list-item", paddingLeft: 0 }}>
            <ListItemText
              primary={
                <Typography variant="subtitle1" component="span">
                  After the grace period, you cannot upgrade this user again for{" "}
                  <Typography component="span" variant="body2">
                    {org.roleReupgradePeriod} days
                  </Typography>
                </Typography>
              }
            />
          </ListItem>
        </List>
      </Box>
    </div>
  );
};

export default DowngradeUserCard;
