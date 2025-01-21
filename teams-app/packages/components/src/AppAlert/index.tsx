import useAppNotification from "@fiftyone/hooks/src/notifications/useAppNotification";
import { NotificationCodeT, NotificationLevelT } from "@fiftyone/teams-state";
import { Alert, Collapse, Typography } from "@mui/material";
import React from "react";
import AlertLink from "../AlertLink";

export default function AppAlert({
  showInFooterOnly = false,
}: {
  showInFooterOnly: boolean;
}) {
  // instead of showing one alert, we show a list of alerts
  const notifications = useAppNotification({ showInFooterOnly });

  const getDismissedAlerts = () => {
    const dismissedAlerts = localStorage.getItem("dismissedAlerts");
    return dismissedAlerts ? JSON.parse(dismissedAlerts) : {};
  };

  const setDismissedAlert = (code: NotificationCodeT) => {
    const dismissedAlerts = getDismissedAlerts();
    dismissedAlerts[code] = new Date().toISOString();
    localStorage.setItem("dismissedAlerts", JSON.stringify(dismissedAlerts));
  };

  const shouldShowAlert = (code: NotificationCodeT) => {
    const dismissedAlerts = getDismissedAlerts();
    if (dismissedAlerts[code]) {
      const lastDismissed = new Date(dismissedAlerts[code]);
      const now = new Date();
      const timeDiff = now.getTime() - lastDismissed.getTime();
      const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds
      return timeDiff > oneDay;
    }
    return true;
  };

  if (!notifications.length) return null;

  return (
    <div data-testid="global-notification-container">
      {notifications.map(
        (msg, idx) =>
          shouldShowAlert(msg.code) && (
            <AlertInfo
              {...msg}
              key={idx}
              setDismissedAlert={setDismissedAlert}
            />
          )
      )}
    </div>
  );
}

interface AlertInfoProps {
  title: string;
  details: string;
  type: NotificationLevelT;
  code: NotificationCodeT;
  setDismissedAlert: (code: string) => void;
}

function AlertInfo({
  title,
  details,
  type,
  code,
  setDismissedAlert,
  overrideBgColor,
  overrideTextColor,
}): AlertInfoProps {
  const isStaticBanner = code === "STATIC_BANNER";
  const [open, setOpen] = React.useState(true);

  const handleClose = isStaticBanner
    ? null
    : () => {
        setDismissedAlert(code);
        setOpen(false);
      };

  const alertSx = isStaticBanner
    ? {
        backgroundColor: overrideBgColor || "inherit",
        color: overrideTextColor || "inherit",
      }
    : {};

  return (
    <Collapse in={open}>
      <Alert
        title={title}
        severity={type}
        onClose={handleClose}
        sx={alertSx}
        {...(isStaticBanner ? { icon: false } : {})}
      >
        <div
          style={{ display: "inline" }}
          data-testid={`global-notification-${code.toLowerCase()}`}
        >
          {isStaticBanner ? (
            <Typography
              sx={alertSx}
              noWrap={Boolean(overrideBgColor) ? true : false}
            >
              {title} <AlertLink code={code} details={details} />
            </Typography>
          ) : (
            <>
              {title} <AlertLink code={code} details={details} />
            </>
          )}
        </div>
      </Alert>
    </Collapse>
  );
}
