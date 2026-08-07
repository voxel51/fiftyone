/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describeChord, tryParseChord } from "@fiftyone/keymap";
import { Box } from "@mui/material";
import React from "react";

/**
 * Renders a stored chord as a key cap. The stored value is a physical code
 * (`KeyS`), so the glyph comes from `describeChord`, which asks the browser what
 * that key produces on the user's actual layout and falls back to a QWERTY
 * table where `getLayoutMap()` isn't available.
 */
const KeyChip: React.FC<{
  chord: string;
  muted?: boolean;
  tone?: "default" | "conflict" | "recording";
}> = ({ chord, muted = false, tone = "default" }) => {
  const parsed = tryParseChord(chord);
  const label = parsed ? describeChord(parsed) : chord;

  return (
    <Box
      component="kbd"
      title={`stored as "${chord}"`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "Palanquin, sans-serif",
        fontSize: "0.75rem",
        lineHeight: 1,
        px: 0.75,
        py: 0.5,
        borderRadius: "4px",
        whiteSpace: "nowrap",
        border: (theme) =>
          `1px solid ${
            tone === "conflict"
              ? theme.palette.error.main
              : tone === "recording"
                ? theme.palette.primary.main
                : theme.palette.divider
          }`,
        borderBottomWidth: "2px",
        backgroundColor: (theme) =>
          tone === "recording"
            ? theme.palette.action.selected
            : theme.palette.background.default,
        color: (theme) =>
          tone === "conflict"
            ? theme.palette.error.main
            : muted
              ? theme.palette.text.disabled
              : theme.palette.text.primary,
        textDecoration: muted ? "line-through" : "none",
      }}
    >
      {label}
    </Box>
  );
};

export default KeyChip;
