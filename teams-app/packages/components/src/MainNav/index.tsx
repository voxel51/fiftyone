import * as React from "react";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import ListItemButton from "@mui/joy/ListItemButton";
import { SettingsOutlined as SettingsOutlinedIcon } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Link from "next/link";
import { useTheme } from "@mui/material";

export default function MainNav() {
  return (
    <Box
      width={82}
      borderRight={(theme) => `1px solid ${theme.palette.divider}`}
      height="100vh"
      bgcolor={(theme) => theme.palette.background.primary}
      position="fixed"
    >
      <List>
        <ListItem>
          <Link href="/datasets">
            <ListItemButton
              sx={{
                justifyContent: "center",
                padding: "1rem",
                alignSelf: "center",
              }}
            >
              <img
                src="/logo-color.png"
                alt="logo"
                height={28.8}
                width={28.8}
              />
            </ListItemButton>
          </Link>
        </ListItem>
        <MainNavItem
          IconComponent={SettingsOutlinedIcon}
          href="/settings/account"
        />
      </List>
    </Box>
  );
}

function MainNavItem(props) {
  const theme = useTheme();

  const { href = "/", IconComponent, label } = props;
  return (
    <ListItem>
      <Link href={href}>
        <ListItemButton sx={{ justifyContent: "center", padding: "1rem" }}>
          <ListItemDecorator sx={{ justifyContent: "center" }}>
            <IconComponent
              sx={{
                display: "flex",
                justifyContent: "center",
                fontSize: "1.8rem",
                color: theme.palette.text.secondary,
              }}
            />
          </ListItemDecorator>
        </ListItemButton>
      </Link>
    </ListItem>
  );
}
