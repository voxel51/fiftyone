/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import * as fos from "@fiftyone/state";
import {
  Alert,
  Box,
  Divider,
  FormControlLabel,
  Link,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Typography,
  useColorScheme,
} from "@mui/material";
import React from "react";
import { useSetRecoilState } from "recoil";

/**
 * Section scaffolding. Only Appearance and Keyboard Shortcuts do anything —
 * the rest are shape, so the sidebar reads like a real settings surface and we
 * can argue about which panes belong here before wiring any of them up.
 */

const SectionHeader: React.FC<{ title: string; blurb?: string }> = ({
  title,
  blurb,
}) => (
  <Box sx={{ mb: 2 }}>
    <Typography variant="h6">{title}</Typography>
    {blurb && (
      <Typography variant="body2" color="text.secondary">
        {blurb}
      </Typography>
    )}
  </Box>
);

const Placeholder: React.FC<{ items: string[]; note?: string }> = ({
  items,
  note,
}) => (
  <Stack spacing={1.5}>
    {note && (
      <Alert severity="info" sx={{ py: 0 }}>
        {note}
      </Alert>
    )}
    <Stack spacing={0.5}>
      {items.map((item) => (
        <Stack
          key={item}
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ py: 0.75, opacity: 0.5 }}
        >
          <Typography variant="body2">{item}</Typography>
          <Switch size="small" disabled />
        </Stack>
      ))}
    </Stack>
  </Stack>
);

export const GeneralSection: React.FC = () => (
  <Box>
    <SectionHeader
      title="General"
      blurb="Session-level preferences that aren't about how the app looks."
    />
    <Placeholder
      note="Placeholder — this POC only implements Appearance and Keyboard Shortcuts."
      items={[
        "Confirm before deleting samples",
        "Restore last view on open",
        "Show onboarding tips",
        "Send anonymous usage analytics",
      ]}
    />
  </Box>
);

/**
 * The one non-shortcut section that is real: it absorbs the theme toggle that
 * currently sits inline in the Nav icon cluster, keeping the existing
 * `switch_app_theme` analytics event intact. The Nav button stays for now — this
 * POC adds a home for the setting without removing the fast path.
 */
export const AppearanceSection: React.FC = () => {
  const { mode, setMode } = useColorScheme();
  const setTheme = useSetRecoilState(fos.theme);
  const trackEvent = useTrackEvent();

  const onChange = (next: "light" | "dark") => {
    setMode(next);
    setTheme(next);
    trackEvent("switch_app_theme", { theme: next });
  };

  return (
    <Box>
      <SectionHeader
        title="Appearance"
        blurb="How the app looks. Changes apply immediately."
      />
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Theme
      </Typography>
      <RadioGroup
        value={mode === "dark" ? "dark" : "light"}
        onChange={(event) => onChange(event.target.value as "light" | "dark")}
      >
        <FormControlLabel
          value="dark"
          control={<Radio size="small" />}
          label={<Typography variant="body2">Dark</Typography>}
        />
        <FormControlLabel
          value="light"
          control={<Radio size="small" />}
          label={<Typography variant="body2">Light</Typography>}
        />
      </RadioGroup>
      <Divider sx={{ my: 2 }} />
      <Placeholder items={["Compact sidebar", "Reduce motion", "Font size"]} />
    </Box>
  );
};

export const DisplaySection: React.FC = () => (
  <Box>
    <SectionHeader title="Display" blurb="Grid and sample rendering options." />
    <Placeholder
      note="The eventual home of the Display Options popout — the de-facto preferences panel today. The design doc lists folding it in here as an explicit follow-on, not part of this work."
      items={[
        "Show confidence",
        "Show index",
        "Show tooltip",
        "Crop to content",
        "Sort filter results by count",
      ]}
    />
  </Box>
);

export const PluginsSection: React.FC = () => (
  <Box>
    <SectionHeader
      title="Plugins"
      blurb="Installed plugins and the hotkeys their operators declare."
    />
    <Placeholder
      note="Operator hotkeys are design-doc §4.9: operators declare a hotkey that flows into the same manifest, ranks below all core bindings, and is remappable like anything else. Nothing is wired up here."
      items={["@voxel51/io", "@voxel51/brain", "@voxel51/annotation"]}
    />
  </Box>
);

export const NotificationsSection: React.FC = () => (
  <Box>
    <SectionHeader
      title="Notifications"
      blurb="What the app tells you about."
    />
    <Placeholder
      items={[
        "Delegated operation finished",
        "Delegated operation failed",
        "New dataset available",
      ]}
    />
  </Box>
);

export const AdvancedSection: React.FC = () => (
  <Box>
    <SectionHeader
      title="Advanced"
      blurb="Experimental behavior and raw configuration."
    />
    <Placeholder
      note="Keymap import/export already lives in the Keyboard Shortcuts pane. A whole-settings blob would belong here."
      items={[
        "Enable experimental panels",
        "Verbose logging",
        "Reset all settings",
      ]}
    />
  </Box>
);

export const AboutSection: React.FC = () => (
  <Box>
    <SectionHeader title="About" />
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        FiftyOne — keyboard shortcuts POC
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This settings modal and the keymap behind it exist to make the keyboard
        shortcuts design doc concrete. See the demo route at{" "}
        <Link href="/keymap-demo">/keymap-demo</Link> for the scope and
        dismissal-stack behavior.
      </Typography>
    </Stack>
  </Box>
);
