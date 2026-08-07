/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { CandidateStatus } from "@fiftyone/keymap";
import {
  describeChord,
  scopeLabel,
  tryParseChord,
  useDismissalStack,
  useLastResolution,
} from "@fiftyone/keymap";
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import React from "react";

const STATUS_COPY: Record<CandidateStatus, { label: string; color: string }> = {
  "would-fire": { label: "fired", color: "success.main" },
  shadowed: { label: "shadowed by a deeper scope", color: "warning.main" },
  "scope-inactive": { label: "scope not active", color: "text.disabled" },
  unbound: { label: "declared, no handler mounted", color: "text.disabled" },
  disabled: {
    label: "enablement predicate returned false",
    color: "text.disabled",
  },
  "suppressed-in-text-input": {
    label: "suppressed — text field has focus",
    color: "info.main",
  },
  "suppressed-not-repeatable": {
    label: "suppressed — key repeat, binding is not repeatable",
    color: "info.main",
  },
};

/**
 * The introspection argument from §4.3, made visible: because candidates are
 * ranked by static declarations and static predicates, we can show the *whole*
 * ordered list and say honestly why each one did or didn't win. A design that
 * let handlers decline at runtime could not produce this panel — which is the
 * decisive reason the doc rejects a general `PASS_THROUGH`.
 */
const ResolutionReadout: React.FC = () => {
  const resolution = useLastResolution();
  const dismissers = useDismissalStack();

  const chord = resolution ? tryParseChord(resolution.chord) : null;

  return (
    <Stack
      spacing={1.5}
      sx={{
        p: 2,
        borderRadius: 2,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        backgroundColor: (theme) => theme.palette.background.paper,
      }}
    >
      <Box>
        <Typography variant="subtitle2">Last resolution</Typography>
        <Typography variant="caption" color="text.secondary">
          Every candidate for the last matched chord, ranked deepest scope
          first.
        </Typography>
      </Box>

      {!resolution ? (
        <Typography variant="body2" color="text.disabled">
          Press one of the keys below.
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              component="kbd"
              sx={{
                px: 1,
                py: 0.5,
                borderRadius: 1,
                border: (theme) => `1px solid ${theme.palette.divider}`,
                borderBottomWidth: 2,
                fontSize: "0.8rem",
              }}
            >
              {chord ? describeChord(chord) : resolution.chord}
            </Box>
            <Typography variant="caption" color="text.secondary">
              stored as <code>{resolution.chord}</code>
            </Typography>
          </Stack>

          <Stack spacing={0.5}>
            {resolution.candidates.map((candidate, index) => {
              const copy = STATUS_COPY[candidate.status];
              return (
                <Stack
                  key={`${candidate.entry.id}-${candidate.chord}`}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ opacity: candidate.status === "would-fire" ? 1 : 0.7 }}
                >
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ width: 16 }}
                  >
                    {index + 1}
                  </Typography>
                  <Chip
                    size="small"
                    label={`depth ${candidate.scopeDepth}`}
                    sx={{ height: 18, fontSize: "0.65rem" }}
                  />
                  <Typography variant="body2" sx={{ minWidth: 0 }}>
                    {scopeLabel(candidate.entry.scope)} ▸{" "}
                    {candidate.entry.label}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" sx={{ color: copy.color }}>
                    {copy.label}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </>
      )}

      <Divider />

      <Box>
        <Typography variant="subtitle2">Dismissal stack</Typography>
        <Typography variant="caption" color="text.secondary">
          Escape pops exactly one layer, innermost first. Today this is ~20
          independent Escape handlers plus a priority 100/200/300 ladder.
        </Typography>
      </Box>

      {dismissers.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          Empty — Escape would fall through to the browser.
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {dismissers.map((dismisser, index) => (
            <Stack
              key={dismisser.id}
              direction="row"
              spacing={1}
              alignItems="center"
            >
              <Typography
                variant="caption"
                color={index === 0 ? "success.main" : "text.disabled"}
                sx={{ width: 60 }}
              >
                {index === 0 ? "next ▸" : `+${index}`}
              </Typography>
              <Typography variant="body2">{dismisser.label}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default ResolutionReadout;
