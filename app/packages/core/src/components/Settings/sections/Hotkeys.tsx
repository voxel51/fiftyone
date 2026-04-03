import React from "react";
import {
  GroupLabel,
  Key,
  KeySeparator,
  KeysRow,
  ShortcutDescription,
  ShortcutGroup,
  ShortcutRow,
} from "../styled";

type Shortcut = {
  description: string;
  /** Each element is one key. Arrays within represent combos (e.g. ["Ctrl","Z"]). */
  keys: string[][];
};

type Category = {
  label: string;
  shortcuts: Shortcut[];
};

const SHORTCUTS: Category[] = [
  {
    label: "Navigation",
    shortcuts: [
      { description: "Toggle sidebar", keys: [["S"]] },
      { description: "Open operators panel", keys: [["~"]] },
      { description: "Close modal / exit mode", keys: [["Esc"]] },
      { description: "Go to grid view", keys: [["G"]] },
    ],
  },
  {
    label: "Samples",
    shortcuts: [
      { description: "Open selected sample", keys: [["Enter"]] },
      { description: "Previous sample", keys: [["←"]] },
      { description: "Next sample", keys: [["→"]] },
      { description: "Select all samples", keys: [["Ctrl", "A"]] },
      { description: "Select range", keys: [["Shift"], ["Click"]] },
    ],
  },
  {
    label: "Grid",
    shortcuts: [
      { description: "Zoom in", keys: [["+"]] },
      { description: "Zoom out", keys: [["-"]] },
      { description: "Reset zoom", keys: [["0"]] },
    ],
  },
  {
    label: "Playback",
    shortcuts: [
      { description: "Play / pause", keys: [["Space"]] },
      { description: "Seek backward", keys: [["←"]] },
      { description: "Seek forward", keys: [["→"]] },
      { description: "Toggle loop", keys: [["L"]] },
    ],
  },
  {
    label: "Annotations",
    shortcuts: [
      { description: "Undo", keys: [["Ctrl", "Z"]] },
      { description: "Redo", keys: [["Ctrl", "Shift", "Z"]] },
      { description: "Delete annotation", keys: [["Delete"]] },
      { description: "Select tool", keys: [["V"]] },
      { description: "Create detection", keys: [["D"]] },
      { description: "Create classification", keys: [["C"]] },
    ],
  },
];

const Keys = ({ keys }: { keys: string[][] }) => (
  <KeysRow>
    {keys.map((combo, ci) => (
      <React.Fragment key={ci}>
        {ci > 0 && <KeySeparator>then</KeySeparator>}
        {combo.map((k, ki) => (
          <React.Fragment key={ki}>
            {ki > 0 && <KeySeparator>+</KeySeparator>}
            <Key>{k}</Key>
          </React.Fragment>
        ))}
      </React.Fragment>
    ))}
  </KeysRow>
);

const Hotkeys = () => (
  <>
    {SHORTCUTS.map((cat) => (
      <ShortcutGroup key={cat.label}>
        <GroupLabel>{cat.label}</GroupLabel>
        {cat.shortcuts.map((s) => (
          <ShortcutRow key={s.description}>
            <ShortcutDescription>{s.description}</ShortcutDescription>
            <Keys keys={s.keys} />
          </ShortcutRow>
        ))}
      </ShortcutGroup>
    ))}
  </>
);

export default Hotkeys;
