/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The slot between two stages: a "+" that becomes a typeahead over the stages
 * this dataset can take.
 *
 * Declared at module scope rather than inside the bar, so it keeps its own
 * typeahead state across the bar's renders instead of remounting — a
 * component created during render is a new type every time, and React
 * discards everything the old one held.
 */

import {
  Anchor,
  Button,
  Combobox,
  type ComboboxOption,
  IconName,
  Size,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React from "react";

import { StageDescription } from "./description";
import styles from "./InsertSlot.module.css";

export interface InsertSlotProps {
  /** Where in the chain a stage inserted here lands. */
  index: number;
  /** The stages this dataset can take, already narrowed by media type. */
  names: readonly string[];
  /** What a stage does, shown inline under its name in the list. */
  describe: (name: string) => string | undefined;
  onInsert: (cls: string, index: number) => void;
  /**
   * Render the typeahead input persistently instead of a "+" that opens it —
   * the empty bar's CTA is the real selector, not a button that becomes one.
   * The stage list drops down while the input is focused.
   */
  pinned?: boolean;
}

export const InsertSlot: React.FC<InsertSlotProps> = ({
  index,
  names,
  describe,
  onInsert,
  pinned,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const options = React.useMemo<ComboboxOption[]>(() => {
    const q = query.trim().toLowerCase();
    return names
      .filter((n) => !q || n.toLowerCase().includes(q))
      .map((name) => {
        const description = describe(name);
        return {
          id: name,
          label: name,
          // What the stage does, without leaving the list — its docstring's
          // opening sentence, served with the schema
          description: description ? (
            <StageDescription text={description} />
          ) : undefined,
        };
      });
  }, [describe, names, query]);

  const insert = (option: ComboboxOption | null) => {
    if (!option) return;
    onInsert(option.id, index);
    setOpen(false);
    setQuery("");
  };

  if (!pinned && !open) {
    // Anchored to the right, not below: a centered tooltip on the leftmost
    // slot extends past the bar's left edge, and voodo's Tooltip does not
    // slide itself back into view. Beside the "+" it grows away from the
    // edge instead.
    return (
      <Tooltip anchor={Anchor.Right} content="Insert stage">
        <Button
          variant={Variant.Icon}
          size={Size.Sm}
          borderless
          leadingIcon={IconName.Add}
          aria-label="Insert stage"
          onClick={() => setOpen(true)}
        />
      </Tooltip>
    );
  }

  return (
    <Combobox
      aria-label="Insert stage"
      placeholder="Add stage…"
      size={Size.Sm}
      className={styles.slot}
      options={options}
      value={null}
      inputValue={query}
      onInputChange={setQuery}
      onChange={insert}
      // Typing then Enter inserts the top match; a bare Enter on a pinned
      // slot reached by Tab inserts nothing
      autoHighlight
      // An unpinned slot was just asked for — the keyboard goes straight in.
      // A pinned one renders at page load and must not steal it.
      autoFocus={!pinned}
      // The bar's gutter clips overflow — the list must escape it
      portal
      onOpenChange={(isOpen) => {
        // An unpinned slot folds back to its "+" once its list is dismissed
        // with nothing typed
        if (!isOpen && !pinned && !query.trim()) setOpen(false);
      }}
    />
  );
};
