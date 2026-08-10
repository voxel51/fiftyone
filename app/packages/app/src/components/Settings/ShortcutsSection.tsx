/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Overlap, OverlapKind, ResolvedBinding } from "@fiftyone/keymap";
import {
  LEGACY_OWNER_LABELS,
  PRESETS,
  formatChord,
  fromDocument,
  hasKeyboardLayout,
  isRemappable,
  notYetMigrated,
  scopeLabel,
  shortcutActiveOnlyAtom,
  shortcutConflictsOnlyAtom,
  shortcutSearchAtom,
  toDocument,
  useChordRecorder,
  useKeyboardLayout,
  useKeymapActions,
  useKeymapView,
  worstKind,
} from "@fiftyone/keymap";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import LayersIcon from "@mui/icons-material/Layers";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useAtom } from "jotai";
import React, { useCallback, useMemo, useRef } from "react";
import KeyChip from "./KeyChip";

const OVERLAP_COPY: Record<
  OverlapKind,
  { label: string; severity: "error" | "warning" | "info" }
> = {
  conflict: {
    label: "Conflict — same key, same scope",
    severity: "error",
  },
  "shadows-ancestor": {
    label: "Shadows a parent scope",
    severity: "warning",
  },
  "shadowed-by-descendant": {
    label: "Shadowed in a child scope",
    severity: "warning",
  },
  shadows: { label: "Also bound elsewhere", severity: "info" },
};

const OverlapNote: React.FC<{ overlap: Overlap }> = ({ overlap }) => {
  const copy = OVERLAP_COPY[overlap.kind];
  const Icon =
    copy.severity === "error"
      ? ErrorOutlineIcon
      : copy.severity === "warning"
        ? LayersIcon
        : InfoOutlinedIcon;

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ pl: 0.25 }}>
      <Icon
        sx={{
          fontSize: 14,
          color: (theme) =>
            copy.severity === "error"
              ? theme.palette.error.main
              : copy.severity === "warning"
                ? theme.palette.warning.main
                : theme.palette.info.main,
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {copy.label} — {scopeLabel(overlap.otherScope)} ▸ {overlap.otherLabel}
      </Typography>
    </Stack>
  );
};

const ShortcutRow: React.FC<{
  binding: ResolvedBinding;
  overlaps: readonly Overlap[];
  reachable: boolean;
  bound: boolean;
  recording: boolean;
  onRecord: () => void;
  onCancelRecord: () => void;
}> = ({
  binding,
  overlaps,
  reachable,
  bound,
  recording,
  onRecord,
  onCancelRecord,
}) => {
  const { entry, keys, isCustomized, isDisabled, source } = binding;
  const actions = useKeymapActions();
  const severity = worstKind(overlaps);
  const hasConflict = severity === "conflict";

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 1,
        alignItems: "start",
        px: 1.5,
        py: 1,
        borderRadius: 1,
        borderLeft: (theme) =>
          `2px solid ${
            hasConflict
              ? theme.palette.error.main
              : severity === "shadows-ancestor" ||
                  severity === "shadowed-by-descendant"
                ? theme.palette.warning.main
                : "transparent"
          }`,
        opacity: reachable ? 1 : 0.55,
        "&:hover": {
          backgroundColor: (theme) => theme.palette.action.hover,
        },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography
            variant="body2"
            sx={{ textDecoration: isDisabled ? "line-through" : "none" }}
          >
            {entry.label}
          </Typography>

          {/* The scope is the reason a command is or isn't reachable, so it is
              shown on every row rather than only on the greyed ones. */}
          <Chip
            size="small"
            label={scopeLabel(entry.scope)}
            sx={{ height: 18, fontSize: "0.65rem" }}
          />

          {!reachable && (
            <Typography variant="caption" color="text.disabled">
              scope not active
            </Typography>
          )}
          {reachable && !bound && !entry.legacyOwner && (
            <Tooltip title="Declared in the manifest, but nothing is currently listening. The row is still listed and still editable — that is the point of separating declaration from binding.">
              <Typography variant="caption" color="text.disabled">
                no handler mounted
              </Typography>
            </Tooltip>
          )}
          {entry.legacyOwner && (
            <Tooltip
              title={`This key works, but ${
                LEGACY_OWNER_LABELS[entry.legacyOwner]
              } still dispatches it rather than the keymap. Rebinding is disabled because the override would be saved and then ignored. Migrating it here is what makes the row editable.`}
            >
              <Chip
                size="small"
                variant="outlined"
                color="info"
                label={`via ${entry.legacyOwner}`}
                sx={{ height: 18, fontSize: "0.65rem" }}
              />
            </Tooltip>
          )}
          {source === "preset" && (
            <Chip
              size="small"
              variant="outlined"
              label="preset"
              sx={{ height: 18, fontSize: "0.65rem" }}
            />
          )}
          {entry.repeatable && (
            <Tooltip title="Fires again while the key is held. Most bindings deliberately do not.">
              <Chip
                size="small"
                variant="outlined"
                label="repeats"
                sx={{ height: 18, fontSize: "0.65rem" }}
              />
            </Tooltip>
          )}
          {entry.allowInTextInput && (
            <Tooltip title="Still fires while a text field has focus.">
              <Chip
                size="small"
                variant="outlined"
                label="in text fields"
                sx={{ height: 18, fontSize: "0.65rem" }}
              />
            </Tooltip>
          )}
          {entry.mayDecline && (
            <Tooltip title="The handler may decline at runtime, so this row cannot promise what the key does.">
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label="conditional"
                sx={{ height: 18, fontSize: "0.65rem" }}
              />
            </Tooltip>
          )}
        </Stack>

        {entry.description && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.25 }}
          >
            {entry.description}
          </Typography>
        )}

        <Stack spacing={0.25} sx={{ mt: overlaps.length ? 0.5 : 0 }}>
          {overlaps.map((overlap) => (
            <OverlapNote
              key={`${overlap.otherId}-${overlap.chord}-${overlap.kind}`}
              overlap={overlap}
            />
          ))}
        </Stack>
      </Box>

      <Stack direction="row" spacing={0.5} alignItems="center">
        {recording ? (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <KeyChip chord="Press a key…" tone="recording" />
            <Typography variant="caption" color="text.secondary">
              Esc or click to cancel
            </Typography>
          </Stack>
        ) : keys.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ pr: 0.5 }}>
            {entry.defaultKeys.length ? "disabled" : "not bound"}
          </Typography>
        ) : (
          keys.map((chord) => (
            <KeyChip
              key={chord}
              chord={chord}
              tone={hasConflict ? "conflict" : "default"}
            />
          ))
        )}

        {!isRemappable(entry) ? (
          <Tooltip
            title={
              entry.legacyOwner
                ? `Not remappable until this command moves onto the keymap; ${
                    LEGACY_OWNER_LABELS[entry.legacyOwner]
                  } would ignore the override.`
                : "Not remappable by design. Escape is arbitrated by the dismissal stack, not bound as an ordinary shortcut."
            }
          >
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ px: 0.5 }}
            >
              {entry.legacyOwner ? "not yet" : "fixed"}
            </Typography>
          </Tooltip>
        ) : (
          <>
            <Tooltip title={recording ? "Cancel" : "Rebind"}>
              <IconButton
                size="small"
                onClick={recording ? onCancelRecord : onRecord}
                sx={{ p: 0.25 }}
                data-cy={`rebind-${entry.id}`}
              >
                {/* Not an "add" icon: this replaces the binding, and an Add
                    glyph invited people to read it as "add a second key". */}
                {recording ? (
                  <CloseIcon sx={{ fontSize: 16 }} />
                ) : (
                  <KeyboardIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>

            <Tooltip
              title={
                isDisabled
                  ? "Enable — restores the default binding"
                  : "Disable this shortcut"
              }
            >
              <Switch
                size="small"
                checked={!isDisabled}
                onChange={() =>
                  isDisabled
                    ? actions.restore(entry.id)
                    : actions.disable(entry.id)
                }
              />
            </Tooltip>

            <Tooltip title="Restore default">
              <IconButton
                size="small"
                disabled={!isCustomized}
                onClick={() => actions.restore(entry.id)}
                sx={{ p: 0.25 }}
              >
                <RestartAltIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>
    </Box>
  );
};

const ShortcutsSection: React.FC = () => {
  useKeyboardLayout();
  const view = useKeymapView();
  const actions = useKeymapActions();
  const [search, setSearch] = useAtom(shortcutSearchAtom);
  const [activeOnly, setActiveOnly] = useAtom(shortcutActiveOnlyAtom);
  const [conflictsOnly, setConflictsOnly] = useAtom(shortcutConflictsOnlyAtom);
  const fileInput = useRef<HTMLInputElement>(null);

  const recorder = useChordRecorder((commandId, chord) => {
    // Replace rather than append: a POC keeps one chord per command, which is
    // the common case. Multi-binding lives in the same place if we want it.
    actions.setKeys(commandId, [formatChord(chord)]);
  });

  const customizedCount = useMemo(
    () => view.bindings.filter((binding) => binding.isCustomized).length,
    [view],
  );

  const conflictCount = useMemo(
    () =>
      [...view.overlaps.values()]
        .flat()
        .filter((overlap) => overlap.kind === "conflict").length / 2,
    [view.overlaps],
  );

  // Counted from the manifest rather than the filtered rows: it's a statement
  // about the app, not about what the search box is currently showing.
  const legacyCount = useMemo(() => notYetMigrated().length, []);

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const byCategory = new Map<string, ResolvedBinding[]>();

    for (const binding of view.bindings) {
      const overlaps = view.overlaps.get(binding.entry.id) ?? [];

      if (conflictsOnly && overlaps.length === 0) {
        continue;
      }
      if (activeOnly && !view.isReachable(binding.entry.scope)) {
        continue;
      }
      if (needle) {
        const haystack = [
          binding.entry.label,
          binding.entry.description ?? "",
          binding.entry.category,
          scopeLabel(binding.entry.scope),
          ...binding.keys,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) {
          continue;
        }
      }

      const existing = byCategory.get(binding.entry.category) ?? [];
      existing.push(binding);
      byCategory.set(binding.entry.category, existing);
    }

    return [...byCategory.entries()];
  }, [view, search, activeOnly, conflictsOnly]);

  const onExport = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          toDocument(
            view.preset,
            view.bindings.reduce<Record<string, string[]>>(
              (accumulator, binding) => {
                if (binding.source === "user") {
                  accumulator[binding.entry.id] = [...binding.keys];
                }
                return accumulator;
              },
              {},
            ),
          ),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fiftyone-keymap.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [view]);

  const onImport = useCallback(
    async (file: File) => {
      const { preset, overrides, dropped } = fromDocument(
        JSON.parse(await file.text()),
      );
      actions.setPreset(preset);
      actions.setOverrides(
        Object.fromEntries(
          Object.entries(overrides).map(([id, keys]) => [id, [...keys]]),
        ),
      );
      if (dropped.length) {
        // Honest about partial imports rather than silently dropping entries.
        console.warn("keymap import dropped unknown entries:", dropped);
      }
    },
    [actions],
  );

  return (
    <Stack spacing={2} sx={{ height: "100%", minHeight: 0 }}>
      <Box>
        <Typography variant="h6">Keyboard Shortcuts</Typography>
        <Typography variant="body2" color="text.secondary">
          Every command the app declares, whether or not the surface that owns
          it is currently open. Rows are greyed when their scope isn't active —
          the scope chip is the reason.
        </Typography>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <TextField
          select
          size="small"
          label="Preset"
          value={view.preset}
          onChange={(event) => actions.setPreset(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          {Object.entries(PRESETS).map(([id, preset]) => (
            <MenuItem key={id} value={id}>
              {preset.label}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onExport} title="Export overrides">
          <Typography variant="caption">Export</Typography>
        </IconButton>
        <IconButton
          size="small"
          onClick={() => fileInput.current?.click()}
          title="Import overrides"
        >
          <Typography variant="caption">Import</Typography>
        </IconButton>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onImport(file);
            }
            event.target.value = "";
          }}
        />
        <Button
          size="small"
          startIcon={<RestartAltIcon fontSize="small" />}
          onClick={() => actions.restoreAll()}
          disabled={customizedCount === 0}
        >
          Reset all{customizedCount > 0 ? ` (${customizedCount})` : ""}
        </Button>
      </Stack>

      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Search commands, keys, scopes…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
            />
          }
          label={<Typography variant="caption">Active scopes only</Typography>}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={conflictsOnly}
              onChange={(event) => setConflictsOnly(event.target.checked)}
            />
          }
          label={
            <Typography variant="caption">Conflicts &amp; shadowing</Typography>
          }
        />
      </Stack>

      {conflictCount > 0 && (
        <Alert severity="error" sx={{ py: 0 }}>
          {conflictCount} true conflict{conflictCount === 1 ? "" : "s"} — same
          key, same scope. Shadowing across scopes is listed separately and is
          legal.
        </Alert>
      )}

      {legacyCount > 0 && (
        <Alert severity="info" sx={{ py: 0 }}>
          {legacyCount} command{legacyCount === 1 ? "" : "s"} listed here{" "}
          {legacyCount === 1 ? "is" : "are"} still dispatched by an older key
          handler. {legacyCount === 1 ? "It works" : "They work"}, but{" "}
          {legacyCount === 1 ? "it can" : "they can"}'t be rebound until the
          owning code moves onto the keymap.
        </Alert>
      )}

      {!hasKeyboardLayout() && (
        <Alert severity="info" sx={{ py: 0 }}>
          Bindings are stored as physical keys. This browser doesn't expose{" "}
          <code>navigator.keyboard.getLayoutMap()</code>, so labels below assume
          a US QWERTY layout. The bindings themselves are correct either way.
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", mx: -1.5 }}>
        {groups.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 1.5, py: 2 }}
          >
            No commands match.
          </Typography>
        )}
        {groups.map(([category, bindings]) => (
          <Box key={category} sx={{ mb: 1.5 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ px: 1.5 }}
            >
              {category}
            </Typography>
            {bindings.map((binding) => (
              <ShortcutRow
                key={binding.entry.id}
                binding={binding}
                overlaps={view.overlaps.get(binding.entry.id) ?? []}
                reachable={view.isReachable(binding.entry.scope)}
                bound={view.isBound(binding.entry.id)}
                recording={recorder.target === binding.entry.id}
                onRecord={() => recorder.start(binding.entry.id)}
                onCancelRecord={recorder.cancel}
              />
            ))}
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export default ShortcutsSection;
