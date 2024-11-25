import { InfoIcon, useTheme } from "@fiftyone/components";
import { useCurrentUser, useUserAudit } from "@fiftyone/hooks";
import { Box } from "@fiftyone/teams-components";
import {
  Alert,
  AlertTitle,
  Tooltip,
  TooltipProps,
  Typography,
  styled,
  tooltipClasses,
} from "@mui/material";
import React, { useState } from "react";
import UserAuditTable from "./UserAuditTable";

interface Props {
  showComplianceWarning?: boolean;
}
export default function LicenseAudit(props: Props) {
  const { showComplianceWarning = false } = props;
  const theme = useTheme();

  const currentUser = useCurrentUser()?.[0];
  const isAdmin = currentUser?.role === "ADMIN";

  const {
    remaining,
    hasCollaborators,
    notInComplianceText,
    error: userAuditError,
  } = useUserAudit();
  const [alertDismissed, _] = useState(false);

  if (userAuditError) {
    return (
      <Alert severity="error" variant="outlined">
        <AlertTitle>{userAuditError}</AlertTitle>
      </Alert>
    );
  }

  if (!remaining) return null;

  const CustomTooltip = styled(({ className, ...props }: TooltipProps) => (
    <Tooltip {...props} classes={{ popper: className }} />
  ))({
    [`& .${tooltipClasses.tooltip}`]: {
      maxWidth: 600,
      background: "none",
      color: theme.text.secondary,
    },
  });

  return (
    <div>
      {showComplianceWarning &&
        isAdmin &&
        notInComplianceText &&
        !alertDismissed && (
          <Alert severity="warning" variant="outlined">
            <AlertTitle>{notInComplianceText}</AlertTitle>
          </Alert>
        )}
      <Alert
        data-testid="license-info-alert"
        severity="info"
        variant="outlined"
        sx={{
          borderColor: theme.text.disabled,
          "& .MuiAlert-icon": {
            color: theme.text.disabled,
          },
          my: 1,
        }}
      >
        <AlertTitle sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="body2">Available Seats</Typography>
          {Boolean(remaining) && isAdmin && (
            <CustomTooltip
              placement="bottom-start"
              title={
                <React.Fragment>
                  <UserAuditTable
                    remaining={remaining}
                    hasCollaborators={hasCollaborators}
                  />
                </React.Fragment>
              }
            >
              <InfoIcon
                data-testid="license-info-icon"
                sx={{
                  color: theme.text.disabled,
                  ml: 1,
                }}
              />
            </CustomTooltip>
          )}
        </AlertTitle>
        <Box display="flex" flexDirection="column">
          <Typography variant="caption" data-testid="license-counts-text">
            <b data-testid="license-users-label">
              Users{" "}
              {`(Admins, Members${!hasCollaborators ? ", Collaborators" : ""})`}
            </b>
            :{" "}
            <span data-testid="license-users-count">
              {remaining.USERS.remaining}
            </span>{" "}
            <b data-testid="license-guests-label">Guests</b>:{" "}
            <span data-testid="license-guests-count">
              {remaining.GUESTS.remaining}
            </span>
            {hasCollaborators && (
              <>
                <span> Collaborators: </span>
                <span data-testid="license-collaborators-count">
                  {remaining.COLLABORATORS.remaining}
                </span>
              </>
            )}
          </Typography>
        </Box>
      </Alert>
    </div>
  );
}
