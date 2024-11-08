import { useCurrentOrganization, useCurrentUser } from "@fiftyone/hooks";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import { InstallModal, UserCard } from "@fiftyone/teams-components";
import SlackIcon from "@fiftyone/teams-components/src/Icons/Slack.icon";
import {
  ArrowCircleDown,
  CodeOutlined as CodeOutlinedIcon,
  Logout,
  SupportOutlined as SupportOutlinedIcon,
  SettingsOutlined as SettingsOutlinedIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
} from "@mui/icons-material";
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useColorScheme,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import NextLink from "next/link";
import React, { useCallback, useState } from "react";
import { useRouter } from "next/router";
import { deregisterAllServiceWorkers } from "lib/serviceWorkerUtils";
import { casSignOut } from "@fiftyone/teams-utilities";

const { DOCUMENTATION_LINK, CONTACT_LINK, SLACK_LINK, SIGN_OUT_PAGE } =
  CONSTANT_VARIABLES;

export default function ProfileMenu() {
  const theme = useTheme();
  const [currentUser = {}] = useCurrentUser();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const userName = currentUser.name;
  const userPicture = currentUser.picture;
  const [installModalOpen, setInstallModalOpen] = useState<boolean>(false);
  const { mode, setMode } = useColorScheme();
  const nextMode = mode === "dark" ? "light" : "dark";
  const currentOrganization = useCurrentOrganization();
  const organizationDisplayName = currentOrganization?.displayName;

  const open = Boolean(anchorEl);
  const handleClose = () => {
    setAnchorEl(null);
  };
  const router = useRouter();
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleInstallModalOpen = () => setInstallModalOpen(true);
  const handleInstallModalClose = () => setInstallModalOpen(false);

  const handleLogout = useCallback(() => {
    deregisterAllServiceWorkers();
    casSignOut();
    router.push(SIGN_OUT_PAGE);
  }, [router]);

  return (
    <Box data-testid="profile-menu">
      <Tooltip title="Account settings" placement="left">
        <IconButton
          data-testid="btn-account-settings"
          data-cy="btn-account-settings"
          onClick={handleClick}
          size="small"
          sx={{ ml: 2 }}
          aria-controls={open ? "account-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={open ? "true" : undefined}
        >
          <UserCard id={currentUser.id} name={userName} src={userPicture} />
        </IconButton>
      </Tooltip>
      <Menu
        data-testid="menu-content"
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: "visible",
            mt: 1.5,
            "&:before": {
              content: '""',
              display: "block",
              position: "absolute",
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: "background.paper",
              transform: "translateY(-50%) rotate(45deg)",
              zIndex: 0,
            },
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <NextLink href="/settings/account">
          <MenuItem>
            <Box display="flex" flexDirection="row">
              <Box>
                <UserCard
                  id={currentUser.id}
                  name={userName}
                  src={userPicture}
                />
              </Box>
              <Box pl={1.5} display="flex" alignItems="center">
                <Typography
                  variant="body1"
                  fontWeight="medium"
                  color={theme.palette.text.primary}
                >
                  {userName}
                  <Typography
                    variant="body1"
                    color={theme.palette.text.secondary}
                    component="p"
                    sx={{ maxWidth: "10rem", whiteSpace: "pre-wrap" }}
                  >
                    {organizationDisplayName}
                  </Typography>
                </Typography>
              </Box>
            </Box>
          </MenuItem>
        </NextLink>
        <Divider />
        <MenuItem onClick={handleInstallModalOpen} data-testid="install">
          <Box display="flex">
            <ListItemIcon sx={{ display: "flex", justifyContent: "center" }}>
              <ArrowCircleDown />
            </ListItemIcon>
            Install FiftyOne
          </Box>
        </MenuItem>
        <a href={SLACK_LINK} target="_blank">
          <MenuItem>
            <Box display="flex">
              <ListItemIcon sx={{ display: "flex", justifyContent: "center" }}>
                <SlackIcon />
              </ListItemIcon>
              Join Slack community
            </Box>
          </MenuItem>
        </a>
        <a href={CONTACT_LINK} target="_blank">
          <MenuItem>
            <Box display="flex">
              <ListItemIcon sx={{ display: "flex", justifyContent: "center" }}>
                <SupportOutlinedIcon />
              </ListItemIcon>
              Contact support
            </Box>
          </MenuItem>
        </a>
        <a href={DOCUMENTATION_LINK} target="_blank">
          <MenuItem>
            <Box display="flex">
              <ListItemIcon sx={{ display: "flex", justifyContent: "center" }}>
                <CodeOutlinedIcon />
              </ListItemIcon>
            </Box>
            API documentation
          </MenuItem>
        </a>
        <Divider />
        <MenuItem
          onClick={() => {
            setMode(nextMode);
          }}
        >
          <Box display="flex">
            <ListItemIcon sx={{ display: "flex", justifyContent: "center" }}>
              {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </ListItemIcon>
          </Box>
          Switch to {nextMode} theme
        </MenuItem>
        <NextLink href="/settings/account">
          <MenuItem>
            <Box display="flex">
              <ListItemIcon sx={{ display: "flex", justifyContent: "center" }}>
                <SettingsOutlinedIcon />
              </ListItemIcon>
            </Box>
            Settings
          </MenuItem>
        </NextLink>
        <MenuItem onClick={handleLogout}>
          <Box display="flex">
            <ListItemIcon sx={{ display: "flex", justifyContent: "center" }}>
              <Logout />
            </ListItemIcon>
          </Box>
          Logout
        </MenuItem>
      </Menu>
      <InstallModal open={installModalOpen} onClose={handleInstallModalClose} />
    </Box>
  );
}
