/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  describeKeys,
  settingsOpenAtom,
  settingsSectionAtom,
  useDismissable,
  useKeyBinding,
  useCommandKeys,
  useKeymapActions,
  useKeymapScope,
  useKeymapView,
} from "@fiftyone/keymap";
import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useSetAtom } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import ResolutionReadout from "./ResolutionReadout";
import ScopeBox from "./ScopeBox";

const COLORS = {
  page: "#8b7cf6",
  canvas: "#2ec4b6",
  tool: "#ff9f1c",
  inspector: "#ef476f",
};

type LogEntry = { id: number; text: string };

let logSeq = 0;

const useLog = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const log = useCallback((text: string) => {
    setEntries((current) => [{ id: logSeq++, text }, ...current].slice(0, 40));
  }, []);
  return { entries, log, clear: () => setEntries([]) };
};

/**
 * Resolves a command's current key for use in prose and log lines. Same reason
 * the legend derives: a hardcoded "A" becomes a lie the moment anyone rebinds,
 * and this demo exists partly to be rebound.
 */
const useKeyLabel = () => {
  const view = useKeymapView();
  return useCallback(
    (commandId: string) =>
      describeKeys(
        view.bindings.find((binding) => binding.entry.id === commandId)?.keys ??
          [],
      ),
    [view],
  );
};

/**
 * Legend rows are keyed by *command id*, and the glyph is resolved from the live
 * keymap. Nothing here hardcodes a key label — that is the habit that produced
 * the app's three drifting shortcut tables (F5) and the `shortcut` fields that
 * advertise keys nothing is bound to (F6). It also means rebinding a command in
 * Settings updates this legend immediately, and a command you rebind away shows
 * "unbound" instead of quietly lying.
 */
const Legend: React.FC<{ items: [string, string][] }> = ({ items }) => {
  const view = useKeymapView();
  const keysById = useMemo(
    () =>
      new Map(view.bindings.map((binding) => [binding.entry.id, binding.keys])),
    [view],
  );

  return (
    <Stack spacing={0.25} sx={{ mt: 1 }}>
      {items.map(([commandId, description]) => {
        const keys = keysById.get(commandId) ?? [];
        const unbound = keys.length === 0;
        return (
          <Stack
            key={commandId}
            direction="row"
            spacing={1}
            alignItems="center"
          >
            <Box
              component="kbd"
              title={commandId}
              sx={{
                minWidth: 24,
                textAlign: "center",
                px: 0.5,
                py: 0.25,
                fontSize: "0.7rem",
                borderRadius: "3px",
                whiteSpace: "nowrap",
                border: (theme) =>
                  `1px solid ${unbound ? theme.palette.warning.main : theme.palette.divider}`,
                borderBottomWidth: 2,
                color: (theme) =>
                  unbound ? theme.palette.warning.main : "inherit",
              }}
            >
              {describeKeys(keys)}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
};

/** Innermost layer: an in-progress shape, the thing Escape should cancel first. */
const ShapeLayer: React.FC<{
  onCancel: () => void;
  log: (text: string) => void;
}> = ({ onCancel, log }) => {
  useDismissable("demo-shape", "In-progress shape", "demo.canvas.tool", () => {
    log("Escape → cancelled the in-progress shape");
    onCancel();
    return true;
  });

  return (
    <Chip
      size="small"
      color="warning"
      label="shape in progress"
      sx={{ height: 20, fontSize: "0.65rem" }}
    />
  );
};

/** Deepest scope, mounted only while the tool is active. */
const ToolBox: React.FC<{
  onExit: () => void;
  log: (text: string) => void;
}> = ({ onExit, log }) => {
  const [shape, setShape] = useState(false);

  const keyLabel = useKeyLabel();

  useKeymapScope("demo.canvas.tool");
  useKeyBinding("demo.tool.action", () =>
    log(
      `${keyLabel("demo.tool.action")} → Tool action (deepest active scope won)`,
    ),
  );
  useDismissable("demo-tool", "Active tool", "demo.canvas.tool", () => {
    log("Escape → exited the tool");
    onExit();
    return true;
  });

  return (
    <ScopeBox
      title="Tool"
      scope="demo.canvas.tool"
      color={COLORS.tool}
      active
      hint="Mounted only while the tool is active, so its scope exists only then"
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" variant="outlined" onClick={() => setShape(true)}>
          Start a shape
        </Button>
        {shape && <ShapeLayer onCancel={() => setShape(false)} log={log} />}
      </Stack>
      <Legend
        items={[
          ["demo.tool.action", "Tool action — shadows both Canvas and Page"],
          ["fo.dismiss", "cancels the shape first, then exits the tool"],
        ]}
      />
    </ScopeBox>
  );
};

const CanvasBox: React.FC<{
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  log: (text: string) => void;
}> = ({ focused, onFocus, onBlur, log }) => {
  const [toolActive, setToolActive] = useState(false);
  const [nudge, setNudge] = useState(0);
  const activateKeys = useCommandKeys("demo.tool.activate");
  const keyLabel = useKeyLabel();

  // The scope is pushed only while the canvas is focused — "mounted *and*
  // interactive", per §4.2. Everything below stays registered either way; what
  // changes is whether the scope is on the stack.
  useKeymapScope("demo.canvas", focused);

  useKeyBinding("demo.canvas.action", () =>
    log(
      `${keyLabel("demo.canvas.action")} → Canvas action (shadowed the Page action)`,
    ),
  );
  useKeyBinding("demo.canvas.draw", () =>
    log(`${keyLabel("demo.canvas.draw")} → Draw`),
  );
  useKeyBinding("demo.canvas.duplicate", () =>
    log(`${keyLabel("demo.canvas.duplicate")} → Duplicate`),
  );
  useKeyBinding("demo.canvas.nudge", () => setNudge((current) => current + 8));
  useKeyBinding("demo.tool.activate", () => setToolActive(true));

  useDismissable(
    "demo-canvas",
    "Canvas focus",
    "demo.canvas",
    () => {
      log("Escape → blurred the canvas");
      onBlur();
      return true;
    },
    focused,
  );

  return (
    <ScopeBox
      title="Canvas"
      scope="demo.canvas"
      color={COLORS.canvas}
      active={focused}
      hint={focused ? "Focused" : "Click to focus and push this scope"}
      onClick={onFocus}
    >
      <Stack spacing={1.5}>
        <Box
          sx={{
            height: 36,
            borderRadius: 1,
            backgroundColor: (theme) => theme.palette.action.hover,
            position: "relative",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 10,
              left: 8 + (nudge % 240),
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: COLORS.canvas,
              transition: "left 60ms linear",
            }}
          />
        </Box>

        {toolActive ? (
          <ToolBox onExit={() => setToolActive(false)} log={log} />
        ) : (
          <Typography variant="caption" color="text.secondary">
            Press <b>{describeKeys(activateKeys)}</b> to activate the tool and
            push a third scope.
          </Typography>
        )}

        <Legend
          items={[
            [
              "demo.canvas.action",
              "Canvas action — shadows the Page action while focused",
            ],
            [
              "demo.canvas.draw",
              "true conflict: Draw and Duplicate, same key, same scope",
            ],
            [
              "demo.canvas.nudge",
              "Nudge — the one repeatable binding here; hold it",
            ],
            ["demo.tool.activate", "activate the tool"],
          ]}
        />
      </Stack>
    </ScopeBox>
  );
};

const InspectorBox: React.FC<{ log: (text: string) => void }> = ({ log }) => {
  const [value, setValue] = useState("");
  const keyLabel = useKeyLabel();

  useKeymapScope("demo.inspector");
  useKeyBinding("demo.inspector.commit", () => {
    log(
      `${keyLabel("demo.inspector.commit")} → committed "${value}" from inside a text field`,
    );
    setValue("");
  });
  useDismissable("demo-inspector", "Inspector", "demo.inspector", () => {
    log("Escape → nothing transient here, so the inspector declined it");
    // Declining is a deliberately narrow PASS_THROUGH: it can only decline.
    return false;
  });

  return (
    <ScopeBox
      title="Inspector"
      scope="demo.inspector"
      color={COLORS.inspector}
      active
      hint="A sibling of Canvas, not an ancestor — so its bindings never compete with the canvas's"
    >
      <Stack spacing={1}>
        <TextField
          size="small"
          placeholder="Type here — the canvas bindings all stop working"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          fullWidth
        />
        <Legend
          items={[
            [
              "demo.inspector.commit",
              "Commit — declares allowInTextInput, so it still fires",
            ],
            [
              "fo.dismiss",
              "declines, so Escape falls through to an outer layer",
            ],
          ]}
        />
      </Stack>
    </ScopeBox>
  );
};

const KeymapDemo: React.FC = () => {
  const { entries, log, clear } = useLog();
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [flash, setFlash] = useState(false);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsSection = useSetAtom(settingsSectionAtom);
  const toggleKeys = useCommandKeys("demo.inspector.toggle");
  const keyLabel = useKeyLabel();
  const actionKeys = useCommandKeys("demo.page.action");
  const drawKeys = useCommandKeys("demo.canvas.draw");
  const view = useKeymapView();
  const { restoreAll } = useKeymapActions();
  // A rebind persists to localStorage, so without this the demo can look
  // silently broken on a later visit — the exact failure the recorder's
  // missing cancel path used to cause.
  const customizedCount = view.bindings.filter(
    (binding) => binding.isCustomized,
  ).length;

  useKeymapScope("demo");
  useKeyBinding("demo.page.flash", () => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 250);
    log(
      `${keyLabel("demo.page.flash")} → Flash (only bound at the page scope, so it always wins)`,
    );
  });
  useKeyBinding("demo.page.action", () =>
    log(
      `${keyLabel("demo.page.action")} → Page action (no deeper scope was active)`,
    ),
  );
  useKeyBinding("demo.inspector.toggle", () =>
    setInspectorOpen((current) => !current),
  );

  return (
    <Box
      onClick={() => setCanvasFocused(false)}
      sx={{
        p: 3,
        height: "100%",
        overflowY: "auto",
        backgroundColor: (theme) =>
          flash ? theme.palette.action.selected : "transparent",
        transition: "background-color 120ms",
      }}
    >
      <Stack spacing={2} sx={{ maxWidth: 1400, mx: "auto" }}>
        <Box>
          <Typography variant="h5">
            Keymap scopes &amp; dismissal stack
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Nesting on screen is the scope tree. Click a box to focus it, watch
            which binding wins, and open{" "}
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                setSettingsSection("shortcuts");
                setSettingsOpen(true);
              }}
              sx={{ p: 0, minWidth: 0, verticalAlign: "baseline" }}
            >
              Settings ▸ Keyboard Shortcuts
            </Button>{" "}
            to rebind any of it live. Every box below is listed there whether or
            not it is mounted.
          </Typography>
        </Box>

        <Alert severity="info" sx={{ py: 0 }}>
          <b>{describeKeys(actionKeys)}</b> is bound three times on purpose —
          Page, Canvas, and Tool. That is <i>shadowing</i>, not a conflict, and
          it is exactly the case §2.4 found the audit overstating.{" "}
          <b>{describeKeys(drawKeys)}</b> is the real conflict: two commands,
          same key, same scope.
        </Alert>

        {customizedCount > 0 && (
          <Alert
            severity="warning"
            sx={{ py: 0 }}
            action={
              <Button
                size="small"
                color="inherit"
                onClick={(event) => {
                  event.stopPropagation();
                  restoreAll();
                }}
              >
                Reset keymap
              </Button>
            }
          >
            {customizedCount} shortcut{customizedCount === 1 ? " is" : "s are"}{" "}
            customized, so the keys below may not match the doc. Overrides
            persist in localStorage across reloads.
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" },
            gap: 2,
            alignItems: "start",
          }}
        >
          <ScopeBox
            title="Page"
            scope="demo"
            color={COLORS.page}
            active
            hint="Pushed for as long as this route is mounted"
          >
            <Stack spacing={2}>
              <CanvasBox
                focused={canvasFocused}
                onFocus={() => setCanvasFocused(true)}
                onBlur={() => setCanvasFocused(false)}
                log={log}
              />
              {inspectorOpen ? (
                <InspectorBox log={log} />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Inspector closed. Press <b>{describeKeys(toggleKeys)}</b> to
                  reopen it — and note it stays listed in Settings while closed,
                  which is the thing that is impossible today.
                </Typography>
              )}
              <Legend
                items={[
                  ["demo.page.flash", "Flash the page"],
                  [
                    "demo.page.action",
                    "Page action — wins only when nothing deeper is active",
                  ],
                  ["demo.inspector.toggle", "toggle the Inspector"],
                ]}
              />
            </Stack>
          </ScopeBox>

          <Stack spacing={2}>
            <ResolutionReadout />

            <Stack
              spacing={1}
              sx={{
                p: 2,
                borderRadius: 2,
                border: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              <Stack direction="row" alignItems="center">
                <Typography variant="subtitle2">Event log</Typography>
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    clear();
                  }}
                >
                  Clear
                </Button>
              </Stack>
              {entries.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  Nothing yet.
                </Typography>
              ) : (
                <Stack
                  spacing={0.25}
                  sx={{ maxHeight: 260, overflowY: "auto" }}
                >
                  {entries.map((entry) => (
                    <Typography key={entry.id} variant="caption">
                      {entry.text}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Stack>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};

export default KeymapDemo;
