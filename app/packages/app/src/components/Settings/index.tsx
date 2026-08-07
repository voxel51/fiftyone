/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Dialog, IconButton } from "@fiftyone/components";
import type { SettingsSection } from "@fiftyone/keymap";
import {
  settingsOpenAtom,
  settingsSectionAtom,
  useDismissable,
  useKeyBinding,
  useKeymapScope,
} from "@fiftyone/keymap";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Box,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useCallback } from "react";
import ShortcutsSection from "./ShortcutsSection";
import {
  AboutSection,
  AdvancedSection,
  AppearanceSection,
  DisplaySection,
  GeneralSection,
  NotificationsSection,
  PluginsSection,
} from "./sections";

const SIDEBAR_WIDTH = 190;

const SECTIONS: {
  id: SettingsSection;
  label: string;
  Component: React.FC;
}[] = [
  { id: "general", label: "General", Component: GeneralSection },
  { id: "appearance", label: "Appearance", Component: AppearanceSection },
  { id: "display", label: "Display", Component: DisplaySection },
  { id: "shortcuts", label: "Keyboard Shortcuts", Component: ShortcutsSection },
  { id: "plugins", label: "Plugins", Component: PluginsSection },
  {
    id: "notifications",
    label: "Notifications",
    Component: NotificationsSection,
  },
  { id: "advanced", label: "Advanced", Component: AdvancedSection },
  { id: "about", label: "About", Component: AboutSection },
];

const SettingsSidebar: React.FC = () => {
  const [section, setSection] = useAtom(settingsSectionAtom);

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
        pr: 1,
        overflowY: "auto",
      }}
    >
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ px: 1.5, display: "block" }}
      >
        Settings
      </Typography>
      <List dense disablePadding>
        {SECTIONS.map(({ id, label }) => (
          <ListItemButton
            key={id}
            selected={section === id}
            onClick={() => setSection(id)}
            sx={{ borderRadius: 1, py: 0.5 }}
          >
            <ListItemText
              primary={label}
              primaryTypographyProps={{ variant: "body2" }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
};

/**
 * The settings shell. A left section list plus a right content pane, following
 * the Color scheme modal's split (§6). The active section is one jotai atom.
 */
export const SettingsModal: React.FC = () => {
  const [open, setOpen] = useAtom(settingsOpenAtom);
  const section = useAtomValue(settingsSectionAtom);
  const close = useCallback(() => setOpen(false), [setOpen]);

  // The modal is a dismissal-stack layer, not an Escape handler: it consumes an
  // Escape only if nothing more transient inside it wanted one first (§4.6).
  useDismissable(
    "settings-modal",
    "Settings modal",
    "app",
    () => {
      close();
      return true;
    },
    open,
  );

  const Active =
    SECTIONS.find((entry) => entry.id === section)?.Component ?? GeneralSection;

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: "min(760px, 88vh)", p: 2 } }}
    >
      <Box
        sx={{
          display: "flex",
          gap: 2,
          height: "100%",
          minHeight: 0,
          pt: 1,
          pr: 4,
        }}
      >
        <SettingsSidebar />
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          <Active />
        </Box>
      </Box>
    </Dialog>
  );
};

/**
 * Gear button for the Nav icon cluster. Also owns the `fo.settings.open`
 * binding, which is declared in the manifest like everything else.
 */
export const SettingsButton: React.FC = () => {
  const setOpen = useSetAtom(settingsOpenAtom);

  // The app scope is always active, so this works from anywhere.
  useKeymapScope("app");
  useKeyBinding("fo.settings.open", () => setOpen((current) => !current));

  return (
    <>
      <IconButton
        title="Settings"
        onClick={() => setOpen(true)}
        sx={{
          color: (theme) => theme.palette.text.secondary,
          m: 0,
          p: "0.5rem",
        }}
        data-cy="settings-button"
      >
        <SettingsIcon color="inherit" />
      </IconButton>
      <SettingsModal />
    </>
  );
};

export default SettingsButton;
