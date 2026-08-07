/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { scopeLabel } from "@fiftyone/keymap";
import { Box, Chip, Stack, Typography } from "@mui/material";
import React from "react";

/**
 * A scope, drawn. Nesting on screen is the scope tree, so "deepest active scope
 * wins" is something you can point at rather than something you have to take on
 * faith. Title top-left, scope id beside it, live active/inactive state on the
 * right.
 */
const ScopeBox: React.FC<
  React.PropsWithChildren<{
    title: string;
    scope: string;
    color: string;
    active: boolean;
    /** Shown under the title — why the scope is or isn't pushed. */
    hint?: string;
    onClick?: () => void;
  }>
> = ({ title, scope, color, active, hint, onClick, children }) => (
  <Box
    onClick={
      onClick
        ? (event) => {
            // Stop at the innermost box so clicking a child doesn't also focus
            // its parent — the same arbitration idea, in the pointer domain.
            event.stopPropagation();
            onClick();
          }
        : undefined
    }
    sx={{
      position: "relative",
      borderRadius: 2,
      p: 2,
      pt: 4.5,
      cursor: onClick ? "pointer" : "default",
      border: `2px solid ${color}`,
      backgroundColor: active ? `${color}22` : "transparent",
      boxShadow: active ? `0 0 0 3px ${color}33` : "none",
      opacity: active ? 1 : 0.6,
      transition: "background-color 120ms, opacity 120ms, box-shadow 120ms",
    }}
  >
    <Stack
      direction="row"
      alignItems="baseline"
      spacing={1}
      sx={{ position: "absolute", top: 8, left: 12, right: 12 }}
    >
      <Typography
        variant="subtitle2"
        sx={{ color, fontWeight: 700, letterSpacing: 0.3 }}
      >
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color, opacity: 0.75 }}>
        {scope}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Chip
        size="small"
        label={active ? "scope pushed" : "not pushed"}
        sx={{
          height: 18,
          fontSize: "0.65rem",
          color: active ? color : "text.disabled",
          border: `1px solid ${active ? color : "transparent"}`,
          backgroundColor: "transparent",
        }}
      />
    </Stack>

    {hint && (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: -1.5, mb: 1.5 }}
      >
        {hint} · resolves as {scopeLabel(scope)}
      </Typography>
    )}

    {children}
  </Box>
);

export default ScopeBox;
